import { useRef, useState, useCallback, useEffect } from 'react'
import type { TrackPoint } from '../types'
import {
  TRACKMAN,
  evaluateBezier,
  calculateBezierT,
  calculateFlightFrames,
  type BezierControlPoints
} from '../lib/trajectory'
import {
  TracerSliderGrid,
  ColorPicker,
  ActionButtons,
  ControlPanel,
  SliderStyles,
  type TracerParams
} from './TracerControls'

interface ControlPoint {
  id: 'controlUp' | 'controlDown' | 'end'
  x: number
  y: number
  label: string
}

const CONTROL_EDGE_MARGIN = 0.035
const OFFSCREEN_CONTROL_MARGIN = 0.25

interface TraceEditorProps {
  points: TrackPoint[]
  videoWidth: number
  videoHeight: number
  containerWidth: number
  containerHeight: number
  fps: number
  totalFrames: number
  tracerColor: string
  initialBallSpeed: number
  onPointsUpdate: (points: TrackPoint[]) => void
  onColorChange: (color: string) => void
  onReset: () => void
  onPreview?: () => void
  enabled?: boolean
}

export function TraceEditor({
  points,
  videoWidth,
  videoHeight,
  containerWidth,
  containerHeight,
  fps,
  totalFrames,
  tracerColor,
  initialBallSpeed,
  onPointsUpdate,
  onColorChange,
  onReset,
  onPreview,
  enabled = true
}: TraceEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedControl, setSelectedControl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isEditMode, setIsEditMode] = useState(true) // Start in edit mode
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })

  // Control points for bezier curve
  const [controlPoints, setControlPoints] = useState<ControlPoint[]>([])
  const hasInitializedRef = useRef(false)
  const userHasEditedRef = useRef(false) // Track if user has made any edits

  // Params for sliders - initialize with passed ballSpeed
  const [params, setParams] = useState<TracerParams>(() => {
    return {
      peakHeight: 0.3,
      curve: 0,
      ballSpeed: initialBallSpeed,
      hangtime: 0.3  // Default moderate hangtime
    }
  })

  // Store start position and impact frame - derived from points prop
  const startPos = points.length > 0 ? { x: points[0].x, y: points[0].y } : { x: 0, y: 0 }
  const impactFrame = points.length > 0 ? points[0].frameIndex : 0

  const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight)
  const offsetX = (containerWidth - videoWidth * scale) / 2
  const offsetY = (containerHeight - videoHeight * scale) / 2

  const toCanvasCoords = useCallback((x: number, y: number) => ({
    x: x * scale + offsetX,
    y: y * scale + offsetY
  }), [scale, offsetX, offsetY])

  const toVideoCoords = useCallback((canvasX: number, canvasY: number) => ({
    x: (canvasX - offsetX) / scale,
    y: (canvasY - offsetY) / scale
  }), [scale, offsetX, offsetY])

  const clampControlPoint = useCallback((point: ControlPoint): ControlPoint => {
    const marginX = videoWidth * CONTROL_EDGE_MARGIN
    const topMargin = -videoHeight * OFFSCREEN_CONTROL_MARGIN
    const bottomMargin = videoHeight * (1 - CONTROL_EDGE_MARGIN)

    return {
      ...point,
      x: Math.max(marginX, Math.min(videoWidth - marginX, point.x)),
      y: Math.max(topMargin, Math.min(bottomMargin, point.y))
    }
  }, [videoWidth, videoHeight])

  // Initialize control points from trajectory using Gemini-style positioning
  useEffect(() => {
    if (points.length < 3 || hasInitializedRef.current) return
    hasInitializedRef.current = true

    const endPoint = points[points.length - 1]

    // Find the peak (highest point - lowest Y value)
    let minY = Infinity
    for (let i = 0; i < points.length; i++) {
      if (points[i].y < minY) {
        minY = points[i].y
      }
    }

    // === TRACKMAN-STYLE CONTROL POINT POSITIONING ===
    // Uses shared TRACKMAN constants for consistency
    const dx = endPoint.x - startPos.x
    const apexHeight = startPos.y - minY
    const apexY = minY
    const apexX = startPos.x + dx * TRACKMAN.APEX_X_RATIO

    // P1: Launch control - MUST use same factor for x and y to create straight trajectory
    const launchFactor = TRACKMAN.LAUNCH_FACTOR_BASE + params.hangtime * TRACKMAN.LAUNCH_FACTOR_HANGTIME
    const p1 = {
      x: startPos.x + (apexX - startPos.x) * launchFactor,
      y: startPos.y - apexHeight * launchFactor  // Same factor = straight line toward apex
    }

    // P2: Descent control - very close to end horizontally, but at apex height for steep drop
    const p2 = {
      x: startPos.x + dx * TRACKMAN.DESCENT_X_RATIO,
      y: apexY  // At apex height = sharp corner before dropping
    }

    setControlPoints([
      clampControlPoint({ id: 'controlUp', x: p1.x, y: p1.y, label: 'Launch' }),
      clampControlPoint({ id: 'controlDown', x: p2.x, y: p2.y, label: 'Descent' }),
      clampControlPoint({ id: 'end', x: endPoint.x, y: endPoint.y, label: 'Endpoint' })
    ])
  }, [points, startPos.x, startPos.y, params.hangtime, clampControlPoint])

  // Regenerate trajectory from control points using cubic Bezier
  const regenerateFromControlPoints = useCallback((controls: ControlPoint[], ballSpeed: number, hangtime: number) => {
    if (controls.length < 3) return

    const controlUp = controls.find(c => c.id === 'controlUp')!
    const controlDown = controls.find(c => c.id === 'controlDown')!
    const endPointCtrl = controls.find(c => c.id === 'end')!

    // Build control points structure for shared functions
    const cp: BezierControlPoints = {
      p0: { x: startPos.x, y: startPos.y },
      p1: { x: controlUp.x, y: controlUp.y },
      p2: { x: controlDown.x, y: controlDown.y },
      p3: { x: endPointCtrl.x, y: endPointCtrl.y }
    }

    // Calculate apex height for physics timing
    const apexY = Math.min(cp.p1.y, cp.p2.y)

    // Calculate physics-based frame counts using shared function
    const { riseFrames, apexFrames, fallFrames, totalFrames: flightTotal } = calculateFlightFrames(
      startPos.y, apexY, endPointCtrl.y, ballSpeed, hangtime, fps
    )

    const maxFrames = totalFrames - impactFrame - 1
    const flightFrames = Math.min(flightTotal, maxFrames)

    const newPoints: TrackPoint[] = []

    const sampleCount = Math.max(1, Math.round(flightFrames * TRACKMAN.SAMPLES_PER_FRAME))

    for (let i = 0; i <= sampleCount; i++) {
      const frameOffset = i / TRACKMAN.SAMPLES_PER_FRAME
      const frameIndex = impactFrame + frameOffset
      if (frameIndex >= totalFrames) break

      // Use shared function for physics-based timing
      const t = Math.min(1, Math.max(0, calculateBezierT(frameOffset, riseFrames, apexFrames, fallFrames)))

      // Evaluate Bezier using shared function
      const point = evaluateBezier(t, cp)

      newPoints.push({
        frameIndex,
        x: Math.max(0, Math.min(videoWidth, point.x)),
        y: Math.max(0, Math.min(videoHeight, point.y)),
        confidence: 1,
        isEstimated: false
      })
    }

    // Only update points if user has made edits
    if (userHasEditedRef.current) {
      onPointsUpdate(newPoints)
    }
  }, [startPos.x, startPos.y, impactFrame, videoWidth, videoHeight, totalFrames, fps, onPointsUpdate])

  // Handle slider changes - apply relative adjustments to preserve manual edits
  const handleParamChange = useCallback((key: keyof TracerParams, value: number) => {
    userHasEditedRef.current = true // Mark that user has made edits
    const oldParams = params
    const newParams = { ...params, [key]: value }
    setParams(newParams)

    if (controlPoints.length < 3) return

    let newControls = [...controlPoints]

    if (key === 'peakHeight') {
      // Adjust Y positions proportionally based on height change
      const heightDelta = (newParams.peakHeight - oldParams.peakHeight) * videoHeight
      newControls = controlPoints.map(cp => {
        if (cp.id === 'end') return cp // Don't move landing point vertically
        // P1 (launch) moves more, P2 (descent) moves less
        const factor = cp.id === 'controlUp' ? 0.9 : 0.7
        return clampControlPoint({
          ...cp,
          y: Math.max(0, Math.min(videoHeight, cp.y - heightDelta * factor))
        })
      })
    } else if (key === 'curve') {
      // Adjust X positions based on curve change (draw/fade)
      // Uses shared TRACKMAN constants for consistency
      newControls = controlPoints.map(cp => {
        if (cp.id === 'end') return cp // Don't move landing point
        const curveFactor = cp.id === 'controlUp' ? TRACKMAN.CURVE_FACTOR_P1 : TRACKMAN.CURVE_FACTOR_P2
        const curveDelta = (newParams.curve - oldParams.curve) * videoWidth * curveFactor
        return clampControlPoint({
          ...cp,
          x: Math.max(0, Math.min(videoWidth, cp.x + curveDelta))
        })
      })
    } else if (key === 'hangtime') {
      // Hangtime adjusts P1's height (affects launch angle/trajectory lift)
      // Uses shared TRACKMAN constant for hangtime factor
      const controlUp = controlPoints.find(c => c.id === 'controlUp')!
      const apexHeight = startPos.y - Math.min(controlUp.y, controlPoints.find(c => c.id === 'controlDown')!.y)
      const liftDelta = (newParams.hangtime - oldParams.hangtime) * apexHeight * TRACKMAN.LAUNCH_FACTOR_HANGTIME
      newControls = controlPoints.map(cp => {
        if (cp.id === 'controlUp') {
          return clampControlPoint({
            ...cp,
            y: Math.max(0, Math.min(videoHeight, cp.y - liftDelta))
          })
        }
        return cp
      })
    }
    // For ballSpeed, just regenerate with same control points

    setControlPoints(newControls)
    regenerateFromControlPoints(newControls, newParams.ballSpeed, newParams.hangtime)
  }, [params, controlPoints, videoWidth, videoHeight, startPos.y, regenerateFromControlPoints, clampControlPoint])

  const HIT_RADIUS = 40

  const getHandleCanvasCoords = useCallback((cp: ControlPoint, radius: number = 16) => {
    const raw = toCanvasCoords(cp.x, cp.y)
    const minX = radius + 10
    const maxX = containerWidth - radius - 10
    const minY = radius + 10
    const maxY = containerHeight - radius - 10

    if (raw.y < minY) {
      const sideX = raw.x < containerWidth / 2 ? minX : maxX
      return { x: sideX, y: minY + 54, raw }
    }

    return {
      x: Math.max(minX, Math.min(maxX, raw.x)),
      y: Math.max(minY, Math.min(maxY, raw.y)),
      raw
    }
  }, [toCanvasCoords, containerWidth, containerHeight])

  const findNearestControl = useCallback((canvasX: number, canvasY: number): string | null => {
    for (const cp of controlPoints) {
      const { x, y } = getHandleCanvasCoords(cp)
      const dist = Math.sqrt((canvasX - x) ** 2 + (canvasY - y) ** 2)
      if (dist < HIT_RADIUS) {
        return cp.id
      }
    }
    return null
  }, [controlPoints, getHandleCanvasCoords])

  const getEventCoords = (e: React.TouchEvent | React.MouseEvent | TouchEvent | MouseEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()

    if ('changedTouches' in e && e.changedTouches.length > 0) {
      return {
        x: e.changedTouches[0].clientX - rect.left,
        y: e.changedTouches[0].clientY - rect.top
      }
    } else if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      }
    } else if ('clientX' in e) {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }
    }
    return null
  }

  const handleStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!enabled || !isEditMode) return

    const coords = getEventCoords(e)
    if (!coords) return

    const nearestId = findNearestControl(coords.x, coords.y)
    if (nearestId) {
      const selectedPoint = controlPoints.find(cp => cp.id === nearestId)
      const pointerVideoCoords = toVideoCoords(coords.x, coords.y)
      dragOffsetRef.current = selectedPoint
        ? {
            x: selectedPoint.x - pointerVideoCoords.x,
            y: selectedPoint.y - pointerVideoCoords.y
          }
        : { x: 0, y: 0 }

      e.preventDefault()
      setSelectedControl(nearestId)
      setIsDragging(true)
    }
  }, [enabled, isEditMode, findNearestControl, controlPoints, toVideoCoords])

  const handleMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!isDragging || !selectedControl) return

    userHasEditedRef.current = true // Mark that user has made edits
    e.preventDefault()
    const coords = getEventCoords(e)
    if (!coords) return

    const videoCoords = toVideoCoords(coords.x, coords.y)
    const dragOffset = dragOffsetRef.current
    const nextControlPoint = clampControlPoint({
      id: selectedControl as ControlPoint['id'],
      x: videoCoords.x + dragOffset.x,
      y: videoCoords.y + dragOffset.y,
      label: ''
    })

    setControlPoints(prev => {
      const updated = prev.map(cp =>
        cp.id === selectedControl ? { ...cp, x: nextControlPoint.x, y: nextControlPoint.y } : cp
      )
      regenerateFromControlPoints(updated, params.ballSpeed, params.hangtime)
      return updated
    })
  }, [isDragging, selectedControl, toVideoCoords, params.ballSpeed, params.hangtime, regenerateFromControlPoints, clampControlPoint])

  const handleEnd = useCallback(() => {
    dragOffsetRef.current = { x: 0, y: 0 }
    setIsDragging(false)
    setSelectedControl(null)
  }, [])

  // Add non-passive event listeners
  useEffect(() => {
    if (!isEditMode) return

    const canvas = canvasRef.current
    if (!canvas) return

    const moveHandler = (e: TouchEvent | MouseEvent) => handleMove(e)
    const endHandler = () => handleEnd()

    canvas.addEventListener('touchmove', moveHandler, { passive: false })
    canvas.addEventListener('mousemove', moveHandler as EventListener, { passive: false })
    window.addEventListener('touchend', endHandler)
    window.addEventListener('mouseup', endHandler)

    return () => {
      canvas.removeEventListener('touchmove', moveHandler)
      canvas.removeEventListener('mousemove', moveHandler as EventListener)
      window.removeEventListener('touchend', endHandler)
      window.removeEventListener('mouseup', endHandler)
    }
  }, [isEditMode, handleMove, handleEnd])

  // Draw control points and guides
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || containerWidth === 0 || containerHeight === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = containerWidth
    canvas.height = containerHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!isEditMode || isPreviewMode || !enabled || controlPoints.length === 0) return

    // Draw bezier curve guide lines
    if (points.length > 0 && controlPoints.length >= 3) {
      const startCanvas = toCanvasCoords(startPos.x, startPos.y)
      const controlUpCanvas = toCanvasCoords(controlPoints[0].x, controlPoints[0].y)
      const controlDownCanvas = toCanvasCoords(controlPoints[1].x, controlPoints[1].y)
      const endCanvas = toCanvasCoords(controlPoints[2].x, controlPoints[2].y)

      // Draw control lines (dashed)
      ctx.beginPath()
      ctx.setLineDash([5, 5])
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.lineWidth = 1
      ctx.moveTo(startCanvas.x, startCanvas.y)
      ctx.lineTo(controlUpCanvas.x, controlUpCanvas.y)
      ctx.lineTo(controlDownCanvas.x, controlDownCanvas.y)
      ctx.lineTo(endCanvas.x, endCanvas.y)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Draw control points
    controlPoints.forEach((cp) => {
      const raw = toCanvasCoords(cp.x, cp.y)
      const isSelected = cp.id === selectedControl
      const radius = isSelected ? 20 : 16
      const { x, y } = getHandleCanvasCoords(cp, radius)
      const isOffscreen = raw.x !== x || raw.y !== y

      // Outer ring shadow
      ctx.beginPath()
      ctx.arc(x, y, radius + 4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fill()

      // Main circle
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)

      if (cp.id === 'end') {
        // End point - orange
        ctx.fillStyle = isSelected ? '#FF4500' : 'rgba(255, 69, 0, 0.9)'
      } else {
        // Control points - gold
        ctx.fillStyle = isSelected ? '#FFD700' : 'rgba(255, 215, 0, 0.9)'
      }
      ctx.fill()

      ctx.strokeStyle = 'white'
      ctx.lineWidth = 3
      ctx.stroke()

      if (isOffscreen) {
        ctx.beginPath()
        ctx.moveTo(x - 6, y - radius - 8)
        ctx.lineTo(x, y - radius - 16)
        ctx.lineTo(x + 6, y - radius - 8)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
        ctx.fill()
      }

      // Label
      ctx.font = 'bold 12px system-ui, sans-serif'
      ctx.fillStyle = 'white'
      ctx.textAlign = 'center'
      ctx.shadowColor = 'black'
      ctx.shadowBlur = 4
      const labelY = y < radius + 32 ? y + radius + 24 : y + radius + 20
      ctx.fillText(cp.label, x, labelY)
      ctx.shadowBlur = 0
    })

    // Draw start point (not editable)
    const start = toCanvasCoords(startPos.x, startPos.y)
    ctx.beginPath()
    ctx.arc(start.x, start.y, 12, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 215, 0, 0.6)'
    ctx.fill()
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.font = 'bold 12px system-ui, sans-serif'
    ctx.fillStyle = 'white'
    ctx.textAlign = 'center'
    ctx.shadowColor = 'black'
    ctx.shadowBlur = 4
    ctx.fillText('Start', start.x, start.y + 28)
    ctx.shadowBlur = 0

  }, [controlPoints, containerWidth, containerHeight, toCanvasCoords, selectedControl, isEditMode, isPreviewMode, enabled, points, startPos, getHandleCanvasCoords])

  return (
    <>
      {/* Edit mode toggle button - compact pill */}
      <button
        onClick={() => {
          setIsEditMode(!isEditMode)
          setIsPreviewMode(false)
        }}
        className={`
          absolute top-3 right-3 z-20 px-3 py-1.5 rounded-full
          flex items-center gap-1.5
          transition-all duration-200
          ${isEditMode
            ? 'bg-[#FFD700] text-black'
            : 'bg-white/10 text-white/90 backdrop-blur-sm'
          }
        `}
        style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
        <span className="text-xs font-semibold">
          {isEditMode ? 'Editing' : 'Edit'}
        </span>
      </button>

      {isEditMode && (
        <button
          onClick={() => {
            setIsPreviewMode(true)
            setIsEditMode(false)
            onPreview?.()
          }}
          className="absolute top-3 left-3 z-20 px-3 py-1.5 rounded-full bg-white/10 text-white/90 backdrop-blur-sm flex items-center gap-1.5 transition-colors hover:bg-white/15"
          style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          <span className="text-xs font-semibold">Preview</span>
        </button>
      )}

      {/* Editor canvas overlay */}
      <canvas
        ref={canvasRef}
        className={`
          absolute inset-0 w-full h-full z-10
          ${isEditMode && !isPreviewMode ? 'touch-none' : 'pointer-events-none'}
          ${isDragging ? 'cursor-grabbing' : isEditMode ? 'cursor-grab' : ''}
        `}
        onTouchStart={handleStart}
        onMouseDown={handleStart}
      />

      {/* Edit mode controls panel - using shared components */}
      {isEditMode && !isPreviewMode && (
        <ControlPanel>
          <TracerSliderGrid
            params={params}
            onParamChange={handleParamChange}
          />
          <ColorPicker
            selectedColor={tracerColor}
            onColorChange={onColorChange}
          />
          <ActionButtons
            onReset={onReset}
            onConfirm={() => setIsEditMode(false)}
          />
        </ControlPanel>
      )}

      <SliderStyles />
    </>
  )
}
