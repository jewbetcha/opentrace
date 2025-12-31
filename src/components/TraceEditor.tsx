import { useRef, useState, useCallback, useEffect } from 'react'
import type { TrackPoint } from '../types'

interface ControlPoint {
  id: 'controlUp' | 'controlDown' | 'end'
  x: number
  y: number
  label: string
}

interface TracerParams {
  peakHeight: number
  curve: number
  ballSpeed: number  // affects rise phase only
  hangtime: number   // 0-1, affects how long ball stays at apex
}

const TRACER_COLORS = [
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Purple', value: '#A855F7' },
  { name: 'Orange', value: '#F97316' },
  { name: 'White', value: '#FFFFFF' },
]

interface TraceEditorProps {
  points: TrackPoint[]
  videoWidth: number
  videoHeight: number
  containerWidth: number
  containerHeight: number
  totalFrames: number
  tracerColor: string
  initialBallSpeed: number
  onPointsUpdate: (points: TrackPoint[]) => void
  onColorChange: (color: string) => void
  onReset: () => void
  enabled?: boolean
}

export function TraceEditor({
  points,
  videoWidth,
  videoHeight,
  containerWidth,
  containerHeight,
  totalFrames,
  tracerColor,
  initialBallSpeed,
  onPointsUpdate,
  onColorChange,
  onReset,
  enabled = true
}: TraceEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedControl, setSelectedControl] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isEditMode, setIsEditMode] = useState(true) // Start in edit mode

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

  // Initialize control points from trajectory (only once)
  useEffect(() => {
    if (points.length < 3 || hasInitializedRef.current) return
    hasInitializedRef.current = true

    const endPoint = points[points.length - 1]

    // Find the peak (highest point - lowest Y value)
    let peakIdx = 0
    let minY = Infinity
    for (let i = 0; i < points.length; i++) {
      if (points[i].y < minY) {
        minY = points[i].y
        peakIdx = i
      }
    }

    // Place control points at ~30% and ~70% of trajectory for tighter curve control
    // These sit closer to the actual trajectory path
    const upIdx = Math.floor(peakIdx * 0.6)  // 60% of way to peak
    const upPoint = points[upIdx] || points[Math.floor(points.length * 0.3)]

    const downIdx = peakIdx + Math.floor((points.length - 1 - peakIdx) * 0.4)  // 40% into descent
    const downPoint = points[downIdx] || points[Math.floor(points.length * 0.7)]

    setControlPoints([
      { id: 'controlUp', x: upPoint.x, y: upPoint.y, label: 'Rise' },
      { id: 'controlDown', x: downPoint.x, y: downPoint.y, label: 'Fall' },
      { id: 'end', x: endPoint.x, y: endPoint.y, label: 'Landing' }
    ])
  }, [points])

  // Regenerate trajectory from control points using cubic Bezier for shape, physics for timing
  const regenerateFromControlPoints = useCallback((controls: ControlPoint[], ballSpeed: number, hangtime: number) => {
    if (controls.length < 3) return

    const controlUp = controls.find(c => c.id === 'controlUp')!
    const controlDown = controls.find(c => c.id === 'controlDown')!
    const endPoint = controls.find(c => c.id === 'end')!

    // Calculate apex height from control points for physics timing
    const apexY = Math.min(controlUp.y, controlDown.y)
    const rise = Math.max(10, startPos.y - apexY)
    const fall = Math.max(10, endPoint.y - apexY)

    // PHYSICS-BASED FRAME CALCULATION
    // Ball speed affects RISE phase only (faster ball = fewer frames to apex)
    // Hangtime affects how long ball stays near apex
    // Fall is purely gravity (constant, determined by fall height)
    const BASE_RISE_FRAMES = 45
    const HANGTIME_FRAMES = 40  // Max frames at apex
    const GRAVITY_SCALE = 12

    // Speed affects rise only
    const riseFrames = Math.max(5, Math.round((BASE_RISE_FRAMES / ballSpeed) * Math.sqrt(rise / 100)))
    // Hangtime adds frames at the apex
    const apexFrames = Math.round(hangtime * HANGTIME_FRAMES)
    // Fall is constant gravity
    const fallFrames = Math.max(5, Math.round(GRAVITY_SCALE * Math.sqrt(fall / 100)))

    const totalFlightFrames = riseFrames + apexFrames + fallFrames
    const maxFrames = totalFrames - impactFrame - 1
    const flightFrames = Math.min(totalFlightFrames, maxFrames)

    const newPoints: TrackPoint[] = []

    // Curve timing: rise takes us to ~0.45, apex hangs around 0.45-0.55, fall takes us to 1
    const riseT = 0.45  // Where on the bezier curve the apex is
    const fallT = 0.55

    for (let i = 0; i <= flightFrames; i++) {
      const frameIndex = impactFrame + i
      if (frameIndex >= totalFrames) break

      // Map frame time to curve position with three phases
      let curveT: number
      if (i <= riseFrames) {
        // Rising phase - ball speed affects this
        const riseProgress = i / riseFrames
        curveT = riseProgress * riseT
      } else if (i <= riseFrames + apexFrames) {
        // Apex phase - hangtime keeps ball near top
        const apexProgress = (i - riseFrames) / Math.max(1, apexFrames)
        curveT = riseT + apexProgress * (fallT - riseT)
      } else {
        // Fall phase - gravity only
        const fallProgress = (i - riseFrames - apexFrames) / fallFrames
        curveT = fallT + fallProgress * (1 - fallT)
      }
      curveT = Math.min(1, Math.max(0, curveT))

      // Cubic Bezier: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
      const u = 1 - curveT
      const u2 = u * u
      const u3 = u2 * u
      const ct2 = curveT * curveT
      const ct3 = ct2 * curveT

      const x = u3 * startPos.x +
                3 * u2 * curveT * controlUp.x +
                3 * u * ct2 * controlDown.x +
                ct3 * endPoint.x

      const y = u3 * startPos.y +
                3 * u2 * curveT * controlUp.y +
                3 * u * ct2 * controlDown.y +
                ct3 * endPoint.y

      newPoints.push({
        frameIndex,
        x: Math.max(0, Math.min(videoWidth, x)),
        y: Math.max(0, Math.min(videoHeight, y)),
        confidence: 1,
        isEstimated: false
      })
    }

    // Only update points if user has made edits (prevents overwriting original trajectory on mount)
    if (userHasEditedRef.current) {
      onPointsUpdate(newPoints)
    }
  }, [startPos.x, startPos.y, impactFrame, videoWidth, videoHeight, totalFrames, onPointsUpdate])

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
        // Move control points up/down based on height change
        const factor = cp.id === 'controlUp' ? 0.8 : 0.6
        return {
          ...cp,
          y: Math.max(0, Math.min(videoHeight, cp.y - heightDelta * factor))
        }
      })
    } else if (key === 'curve') {
      // Adjust X positions based on curve change (draw/fade)
      const curveDelta = (newParams.curve - oldParams.curve) * videoWidth * 0.15
      newControls = controlPoints.map(cp => {
        if (cp.id === 'end') return cp // Don't move landing point
        return {
          ...cp,
          x: Math.max(0, Math.min(videoWidth, cp.x + curveDelta))
        }
      })
    }
    // For ballSpeed and hangtime, just regenerate with same control points (physics recalculates frames)

    setControlPoints(newControls)
    regenerateFromControlPoints(newControls, newParams.ballSpeed, newParams.hangtime)
  }, [params, controlPoints, videoWidth, videoHeight, regenerateFromControlPoints])

  const HIT_RADIUS = 40

  const findNearestControl = useCallback((canvasX: number, canvasY: number): string | null => {
    for (const cp of controlPoints) {
      const { x, y } = toCanvasCoords(cp.x, cp.y)
      const dist = Math.sqrt((canvasX - x) ** 2 + (canvasY - y) ** 2)
      if (dist < HIT_RADIUS) {
        return cp.id
      }
    }
    return null
  }, [controlPoints, toCanvasCoords])

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
      e.preventDefault()
      setSelectedControl(nearestId)
      setIsDragging(true)
    }
  }, [enabled, isEditMode, findNearestControl])

  const handleMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!isDragging || !selectedControl) return

    userHasEditedRef.current = true // Mark that user has made edits
    e.preventDefault()
    const coords = getEventCoords(e)
    if (!coords) return

    const videoCoords = toVideoCoords(coords.x, coords.y)
    const clampedX = Math.max(0, Math.min(videoWidth, videoCoords.x))
    const clampedY = Math.max(0, Math.min(videoHeight, videoCoords.y))

    setControlPoints(prev => {
      const updated = prev.map(cp =>
        cp.id === selectedControl ? { ...cp, x: clampedX, y: clampedY } : cp
      )
      regenerateFromControlPoints(updated, params.ballSpeed, params.hangtime)
      return updated
    })
  }, [isDragging, selectedControl, toVideoCoords, videoWidth, videoHeight, params.ballSpeed, params.hangtime, regenerateFromControlPoints])

  const handleEnd = useCallback(() => {
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

    if (!isEditMode || !enabled || controlPoints.length === 0) return

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
      const { x, y } = toCanvasCoords(cp.x, cp.y)
      const isSelected = cp.id === selectedControl
      const radius = isSelected ? 20 : 16

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

      // Label
      ctx.font = 'bold 12px system-ui, sans-serif'
      ctx.fillStyle = 'white'
      ctx.textAlign = 'center'
      ctx.shadowColor = 'black'
      ctx.shadowBlur = 4
      ctx.fillText(cp.label, x, y + radius + 20)
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

  }, [controlPoints, containerWidth, containerHeight, toCanvasCoords, selectedControl, isEditMode, enabled, points, startPos])

  return (
    <>
      {/* Edit mode toggle button - compact pill */}
      <button
        onClick={() => setIsEditMode(!isEditMode)}
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

      {/* Editor canvas overlay */}
      <canvas
        ref={canvasRef}
        className={`
          absolute inset-0 w-full h-full z-10
          ${isEditMode ? 'touch-none' : 'pointer-events-none'}
          ${isDragging ? 'cursor-grabbing' : isEditMode ? 'cursor-grab' : ''}
        `}
        onTouchStart={handleStart}
        onMouseDown={handleStart}
      />

      {/* Edit mode controls panel - ultra compact for mobile */}
      {isEditMode && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-black/95 backdrop-blur-sm py-3 px-3 border-t border-white/5">
          <div className="max-w-sm mx-auto space-y-2">
            {/* Sliders in a tighter grid */}
            <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1.5 items-center text-[11px]">
              <span className="text-white/50 font-medium">Height</span>
              <input
                type="range"
                min="5"
                max="80"
                value={params.peakHeight * 100}
                onChange={(e) => handleParamChange('peakHeight', Number(e.target.value) / 100)}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-[#FFD700]"
              />
              <span className="text-white/70 tabular-nums w-8 text-right">{Math.round(params.peakHeight * 100)}%</span>

              <span className="text-white/50 font-medium">Curve</span>
              <input
                type="range"
                min="-100"
                max="100"
                value={params.curve * 100}
                onChange={(e) => handleParamChange('curve', Number(e.target.value) / 100)}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-[#FFD700]"
              />
              <span className="text-white/70 tabular-nums w-8 text-right">
                {params.curve > 0.05 ? `+${Math.round(params.curve * 100)}` :
                 params.curve < -0.05 ? `${Math.round(params.curve * 100)}` : '0'}
              </span>

              <span className="text-white/50 font-medium">Speed</span>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={params.ballSpeed}
                onChange={(e) => handleParamChange('ballSpeed', Number(e.target.value))}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-[#FFD700]"
              />
              <span className="text-white/70 tabular-nums w-8 text-right">{params.ballSpeed.toFixed(1)}x</span>

              <span className="text-white/50 font-medium">Hang</span>
              <input
                type="range"
                min="0"
                max="100"
                value={params.hangtime * 100}
                onChange={(e) => handleParamChange('hangtime', Number(e.target.value) / 100)}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer accent-[#FFD700]"
              />
              <span className="text-white/70 tabular-nums w-8 text-right">{Math.round(params.hangtime * 100)}%</span>
            </div>

            {/* Color picker - compact horizontal row */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[11px] text-white/50 font-medium">Color</span>
              <div className="flex gap-1.5 flex-1">
                {TRACER_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => onColorChange(c.value)}
                    className={`w-5 h-5 rounded-full transition-transform ${
                      tracerColor === c.value
                        ? 'ring-2 ring-white ring-offset-1 ring-offset-black scale-110'
                        : 'opacity-50 hover:opacity-80'
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Action buttons - slim inline */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={onReset}
                className="flex-1 py-1.5 rounded-lg bg-white/5 text-white/70 text-[11px] font-medium hover:bg-white/10 transition-colors"
                style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
              >
                Reset
              </button>
              <button
                onClick={() => setIsEditMode(false)}
                className="flex-1 py-1.5 rounded-lg bg-[#FFD700] text-black text-[11px] font-semibold hover:bg-[#FFD700]/90 transition-colors"
                style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap');

        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: #1a1a1a;
          border-radius: 9999px;
          height: 4px;
        }

        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #FFD700;
          cursor: pointer;
          border: none;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        }

        input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #FFD700;
          cursor: pointer;
          border: none;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        }
      `}</style>
    </>
  )
}
