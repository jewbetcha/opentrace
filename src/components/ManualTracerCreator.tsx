import { useState, useRef, useEffect, useCallback } from 'react'
import type { TrackPoint } from '../types'

interface ManualTracerCreatorProps {
  videoWidth: number
  videoHeight: number
  containerWidth: number
  containerHeight: number
  fps: number
  totalFrames: number
  currentFrame: number
  onSeekToFrame?: (frame: number) => void
  onComplete: (points: TrackPoint[], color: string, ballSpeed: number) => void
}

interface TracerParams {
  startX: number
  startY: number
  endX: number
  endY: number
  peakHeight: number
  curve: number
  ballSpeed: number  // 0.5 to 2.0 multiplier (1.0 = normal)
  impactFrame: number
  color: string
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

type Mode = 'impact' | 'start' | 'end' | 'adjust'

export function ManualTracerCreator({
  videoWidth,
  videoHeight,
  containerWidth,
  containerHeight,
  fps,
  totalFrames,
  currentFrame,
  onComplete
}: ManualTracerCreatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<Mode>('impact')
  const [params, setParams] = useState<TracerParams>({
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    peakHeight: 0.3,
    curve: 0,
    ballSpeed: 1.0,  // 1.0 = normal speed
    impactFrame: 0,
    color: '#3B82F6'
  })

  // Track if points have been explicitly set (not just checked for non-zero)
  const [pointsSet, setPointsSet] = useState({ start: false, end: false })

  const generateTrajectory = useCallback((): TrackPoint[] => {
    // Show trajectory preview when both points are set
    const hasPoints = pointsSet.start && pointsSet.end
    if (!hasPoints && mode !== 'adjust') return []

    const points: TrackPoint[] = []
    const { startX, startY, endX, endY, peakHeight, curve, ballSpeed, impactFrame } = params

    // Calculate apex position (peak of trajectory)
    const apexY = startY - peakHeight * videoHeight  // Screen coords: up is negative Y

    // Heights for physics calculations (in screen coords, positive values)
    const rise = startY - apexY  // Height from start to apex
    const fall = endY - apexY    // Height from apex to end

    // PHYSICS-BASED FRAME CALCULATION
    // Ball speed affects RISE phase (faster ball = fewer frames to reach apex)
    // Fall is purely gravity (constant, determined by fall height)
    const BASE_RISE_FRAMES = 60
    const GRAVITY_SCALE = 15  // Reduced so fall doesn't dominate

    // Speed affects rise, fall is constant gravity
    const riseFrames = Math.max(5, Math.round((BASE_RISE_FRAMES / ballSpeed) * Math.sqrt(Math.max(10, rise) / 100)))
    const fallFrames = Math.max(5, Math.round(GRAVITY_SCALE * Math.sqrt(Math.max(10, fall) / 100)))

    const totalFlightFrames = riseFrames + fallFrames
    const maxFrames = totalFrames - impactFrame - 1
    const flightFrames = Math.min(totalFlightFrames, maxFrames)

    // Apex position in normalized time
    const apexT = riseFrames / totalFlightFrames

    // Generate trajectory points
    for (let i = 0; i <= flightFrames; i++) {
      const frameIndex = impactFrame + i
      if (frameIndex >= totalFrames) break

      // Map frame time to curve position
      // Rise phase: frames 0 to riseFrames map to curve t = 0 to apexT
      // Fall phase: frames riseFrames to total map to curve t = apexT to 1
      let t: number
      if (i <= riseFrames) {
        // Rising - speed already affects riseFrames count
        t = (i / riseFrames) * apexT
      } else {
        // Falling - constant gravity timing
        const fallProgress = (i - riseFrames) / fallFrames
        t = apexT + fallProgress * (1 - apexT)
      }
      t = Math.min(1, Math.max(0, t))

      // X: Linear motion (constant horizontal velocity throughout flight)
      let x = startX + (endX - startX) * t

      // Y: Quadratic parabola through start, apex, end
      const dy = endY - startY
      const A = (-rise - dy * apexT) / (apexT * (apexT - 1))
      const B = dy - A
      const C = startY
      let y = A * t * t + B * t + C

      // Add draw/fade curve offset (sine curve for side spin effect)
      const curveOffset = Math.sin(t * Math.PI) * curve * videoWidth * 0.2
      x += curveOffset

      points.push({
        frameIndex,
        x: Math.max(0, Math.min(videoWidth, x)),
        y: Math.max(0, Math.min(videoHeight, y)),
        confidence: 1,
        isEstimated: false
      })
    }

    return points
  }, [params, videoWidth, videoHeight, pointsSet, mode, totalFrames])

  const previewPoints = generateTrajectory()

  // Draw preview - calculate trajectory directly here for reliability
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Use actual canvas client dimensions if container size not ready
    const width = containerWidth || canvas.clientWidth
    const height = containerHeight || canvas.clientHeight
    if (width === 0 || height === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const currentScale = Math.min(width / videoWidth, height / videoHeight)
    const currentOffsetX = (width - videoWidth * currentScale) / 2
    const currentOffsetY = (height - videoHeight * currentScale) / 2

    const toCoords = (x: number, y: number) => ({
      x: x * currentScale + currentOffsetX,
      y: y * currentScale + currentOffsetY
    })

    // Draw trajectory when in adjust mode (both points are set)
    if (mode === 'adjust') {
      const { startX, startY, endX, endY, peakHeight, curve, ballSpeed, color } = params

      // Calculate apex position (same as generateTrajectory)
      const apexY = startY - peakHeight * videoHeight
      const rise = startY - apexY
      const fall = endY - apexY

      // Physics-based frame calculation (same as generateTrajectory)
      const BASE_RISE_FRAMES = 60
      const GRAVITY_SCALE = 15
      const riseFrames = Math.max(5, Math.round((BASE_RISE_FRAMES / ballSpeed) * Math.sqrt(Math.max(10, rise) / 100)))
      const fallFrames = Math.max(5, Math.round(GRAVITY_SCALE * Math.sqrt(Math.max(10, fall) / 100)))
      const totalFlightFrames = riseFrames + fallFrames
      const maxFrames = totalFrames - params.impactFrame - 1
      const flightFrames = Math.min(totalFlightFrames, maxFrames)

      // Pre-calculate parabola coefficients
      const apexT = riseFrames / totalFlightFrames
      const dy = endY - startY
      const A = (-rise - dy * apexT) / (apexT * (apexT - 1))
      const B = dy - A
      const C = startY

      // Generate trajectory points for drawing (just positions, no frame scaling needed for preview)
      const trajectoryPoints: { x: number; y: number }[] = []
      for (let i = 0; i <= flightFrames; i++) {
        const t = i / flightFrames

        // X: Linear motion
        let x = startX + (endX - startX) * t

        // Y: Quadratic parabola
        let y = A * t * t + B * t + C

        // Add curve offset
        const curveOffset = Math.sin(t * Math.PI) * curve * videoWidth * 0.2
        x += curveOffset

        trajectoryPoints.push({ x, y })
      }

      // Draw trajectory
      if (trajectoryPoints.length > 1) {
        ctx.beginPath()
        const first = toCoords(trajectoryPoints[0].x, trajectoryPoints[0].y)
        ctx.moveTo(first.x, first.y)

        for (let i = 1; i < trajectoryPoints.length; i++) {
          const p = toCoords(trajectoryPoints[i].x, trajectoryPoints[i].y)
          ctx.lineTo(p.x, p.y)
        }

        ctx.strokeStyle = color
        ctx.lineWidth = 6
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.shadowColor = color
        ctx.shadowBlur = 15
        ctx.stroke()
        ctx.shadowBlur = 0
      }
    }

    // Draw start point
    if (mode === 'start' || mode === 'end' || mode === 'adjust') {
      if (params.startX !== 0 || params.startY !== 0) {
        const start = toCoords(params.startX, params.startY)
        ctx.beginPath()
        ctx.arc(start.x, start.y, mode === 'start' ? 16 : 12, 0, Math.PI * 2)
        ctx.fillStyle = params.color
        ctx.fill()
        ctx.strokeStyle = '#FFF'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    // Draw end point
    if ((mode === 'end' || mode === 'adjust') && (params.endX !== 0 || params.endY !== 0)) {
      const end = toCoords(params.endX, params.endY)
      ctx.beginPath()
      ctx.arc(end.x, end.y, mode === 'end' ? 16 : 12, 0, Math.PI * 2)
      ctx.fillStyle = params.color
      ctx.fill()
      ctx.strokeStyle = '#FFF'
      ctx.lineWidth = 2
      ctx.stroke()
    }

  }, [params, containerWidth, containerHeight, videoWidth, videoHeight, mode])

  const handleCanvasInteraction = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Only handle start and end modes
    if (mode !== 'start' && mode !== 'end') return

    e.preventDefault()
    e.stopPropagation()

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()

    // Get click coordinates
    let clientX: number, clientY: number
    if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX
      clientY = e.changedTouches[0].clientY
    } else if ('clientX' in e) {
      clientX = e.clientX
      clientY = e.clientY
    } else {
      return
    }

    // Calculate position relative to canvas
    const canvasX = clientX - rect.left
    const canvasY = clientY - rect.top

    // Use rect dimensions for scaling (CSS dimensions, not canvas pixel dimensions)
    const displayWidth = rect.width || containerWidth
    const displayHeight = rect.height || containerHeight

    if (displayWidth === 0 || displayHeight === 0) return

    // Calculate scale based on display size
    const currentScale = Math.min(displayWidth / videoWidth, displayHeight / videoHeight)
    const currentOffsetX = (displayWidth - videoWidth * currentScale) / 2
    const currentOffsetY = (displayHeight - videoHeight * currentScale) / 2

    // Convert to video coordinates
    const x = (canvasX - currentOffsetX) / currentScale
    const y = (canvasY - currentOffsetY) / currentScale

    const clampedX = Math.max(0, Math.min(videoWidth, x))
    const clampedY = Math.max(0, Math.min(videoHeight, y))

    if (mode === 'start') {
      setParams(p => ({ ...p, startX: clampedX, startY: clampedY }))
      setPointsSet(p => ({ ...p, start: true }))
      setMode('end')
    } else if (mode === 'end') {
      setParams(p => ({ ...p, endX: clampedX, endY: clampedY }))
      setPointsSet(p => ({ ...p, end: true }))
      setMode('adjust')
    }
  }, [mode, videoWidth, videoHeight, containerWidth, containerHeight])

  const handleImpactConfirm = () => {
    setParams(p => ({ ...p, impactFrame: currentFrame }))
    setMode('start')
  }

  const handleComplete = () => {
    onComplete(previewPoints, params.color, params.ballSpeed)
  }

  return (
    <>
      {/* Canvas overlay - always visible, interactive in start/end modes */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full z-20 ${mode === 'start' || mode === 'end' ? 'cursor-crosshair' : 'pointer-events-none'}`}
        onClick={(e) => {
          e.stopPropagation()
          handleCanvasInteraction(e)
        }}
        onTouchEnd={(e) => {
          e.preventDefault()
          e.stopPropagation()
          handleCanvasInteraction(e)
        }}
      />

      {/* Impact frame selection */}
      {mode === 'impact' && (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/95 to-transparent pt-8 pb-6 px-4">
          <div className="max-w-md mx-auto">
            <h3 className="text-lg font-medium text-white mb-1 text-center" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>
              Find the Impact Frame
            </h3>
            <p className="text-sm text-neutral-400 mb-4 text-center">
              Scrub to find the exact moment the club hits the ball
            </p>

            {/* Frame scrubber */}
            <div className="mb-4">
              <input
                type="range"
                min="0"
                max={totalFrames - 1}
                value={currentFrame}
                onChange={(e) => {
                  const frame = Number(e.target.value)
                  // Seek video via parent
                  const video = document.querySelector('video')
                  if (video) {
                    video.currentTime = frame / fps
                  }
                }}
                className="w-full h-2 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
            </div>

            {/* Frame step controls */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <button
                onClick={() => {
                  const video = document.querySelector('video')
                  if (video) {
                    video.currentTime = Math.max(0, video.currentTime - 1/fps)
                  }
                }}
                className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="text-2xl font-bold text-[#FFD700] tabular-nums min-w-[140px] text-center" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>
                {currentFrame} / {totalFrames}
              </div>

              <button
                onClick={() => {
                  const video = document.querySelector('video')
                  if (video) {
                    video.currentTime = Math.min(video.duration, video.currentTime + 1/fps)
                  }
                }}
                className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <button
              onClick={handleImpactConfirm}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#FFD700] to-[#FF4500] text-black font-semibold text-lg hover:opacity-90 transition-opacity touch-target"
              style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
            >
              Set Impact Frame
            </button>
          </div>
        </div>
      )}

      {/* Start/End point instructions */}
      {(mode === 'start' || mode === 'end') && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-5 py-3 rounded-2xl bg-black/80 backdrop-blur-sm">
          <p className="text-white text-center" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>
            {mode === 'start' && 'Tap where the ball starts'}
            {mode === 'end' && 'Tap where the ball lands'}
          </p>
        </div>
      )}

      {/* Adjustment controls - compact layout */}
      {mode === 'adjust' && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-black/95 backdrop-blur-sm pt-4 pb-4 px-4 border-t border-white/10">
          <div className="max-w-md mx-auto space-y-3">
            {/* Peak Height */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-white/80 w-12 flex-shrink-0 font-medium">Height</label>
              <input
                type="range"
                min="0"
                max="80"
                value={params.peakHeight * 100}
                onChange={(e) => setParams(p => ({ ...p, peakHeight: Number(e.target.value) / 100 }))}
                className="flex-1 h-1.5 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
              <span className="text-xs text-white tabular-nums w-10 text-right">{Math.round(params.peakHeight * 100)}%</span>
            </div>

            {/* Curve */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-white/80 w-12 flex-shrink-0 font-medium">Curve</label>
              <input
                type="range"
                min="-100"
                max="100"
                value={params.curve * 100}
                onChange={(e) => setParams(p => ({ ...p, curve: Number(e.target.value) / 100 }))}
                className="flex-1 h-1.5 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
              <span className="text-xs text-white tabular-nums w-10 text-right">
                {params.curve > 0 ? `+${Math.round(params.curve * 100)}` :
                 params.curve < 0 ? `${Math.round(params.curve * 100)}` : '0'}
              </span>
            </div>

            {/* Ball Speed */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-white/80 w-12 flex-shrink-0 font-medium">Speed</label>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={params.ballSpeed}
                onChange={(e) => setParams(p => ({ ...p, ballSpeed: Number(e.target.value) }))}
                className="flex-1 h-1.5 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
              <span className="text-xs text-white tabular-nums w-10 text-right">{params.ballSpeed.toFixed(1)}x</span>
            </div>

            {/* Color picker - inline */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/80 w-12 flex-shrink-0 font-medium">Color</span>
              <div className="flex gap-2 flex-1">
                {TRACER_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setParams(p => ({ ...p, color: c.value }))}
                    className={`w-7 h-7 rounded-full border-2 transition-all flex-shrink-0 ${
                      params.color === c.value
                        ? 'border-white scale-110'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.value, boxShadow: params.color === c.value ? `0 0 8px ${c.value}` : 'none' }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => {
                  setMode('impact')
                  setParams(p => ({ ...p, startX: 0, startY: 0, endX: 0, endY: 0 }))
                }}
                className="flex-1 py-2.5 rounded-xl bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700 transition-colors touch-target"
                style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
              >
                Start Over
              </button>
              <button
                onClick={handleComplete}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#FFD700] to-[#FF4500] text-black text-sm font-semibold hover:opacity-90 transition-opacity touch-target"
                style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
              >
                Apply & Edit Curve
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');

        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          background: #262626;
          border-radius: 9999px;
        }

        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #FFD700;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }

        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #FFD700;
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
      `}</style>
    </>
  )
}
