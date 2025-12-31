import { useState, useRef, useEffect, useCallback } from 'react'
import type { TrackPoint } from '../types'
import {
  calculateTrackmanControlPoints,
  evaluateBezier,
  generateBezierPoints,
  calculateBezierT,
  calculateFlightFrames
} from '../lib/trajectory'

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
  ballSpeed: number  // affects rise phase only
  hangtime: number   // 0-1, affects how long ball stays at apex
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
    ballSpeed: 1.0,
    hangtime: 0.3,  // Default moderate hangtime
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
    const { startX, startY, endX, endY, peakHeight, curve, ballSpeed, hangtime, impactFrame } = params

    // Calculate control points using shared Trackman function
    const cp = calculateTrackmanControlPoints({
      startX, startY, endX, endY,
      peakHeight, curve, hangtime,
      videoWidth, videoHeight
    })

    // Calculate apex Y for physics timing
    const apexHeight = peakHeight * videoHeight
    const apexY = Math.min(startY, endY) - apexHeight

    // Calculate physics-based frame counts
    const { riseFrames, apexFrames, fallFrames, totalFrames: flightTotal } = calculateFlightFrames(
      startY, apexY, endY, ballSpeed, hangtime
    )

    const maxFrames = totalFrames - impactFrame - 1
    const flightFrames = Math.min(flightTotal, maxFrames)

    // Generate trajectory using cubic Bezier with physics timing
    for (let i = 0; i <= flightFrames; i++) {
      const frameIndex = impactFrame + i
      if (frameIndex >= totalFrames) break

      // Get t parameter with physics-based timing
      const t = Math.min(1, Math.max(0, calculateBezierT(i, riseFrames, apexFrames, fallFrames)))

      // Evaluate Bezier curve at t
      const point = evaluateBezier(t, cp)

      points.push({
        frameIndex,
        x: Math.max(0, Math.min(videoWidth, point.x)),
        y: Math.max(0, Math.min(videoHeight, point.y)),
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
      const { startX, startY, endX, endY, peakHeight, curve, hangtime, color } = params

      // Use shared Trackman function for control points
      const cp = calculateTrackmanControlPoints({
        startX, startY, endX, endY,
        peakHeight, curve, hangtime,
        videoWidth, videoHeight
      })

      // Generate trajectory points using shared function
      const trajectoryPoints = generateBezierPoints(cp, 60)

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

      {/* Impact frame selection - compact */}
      {mode === 'impact' && (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-black/95 backdrop-blur-sm py-3 px-3 border-t border-white/5">
          <div className="max-w-sm mx-auto space-y-2">
            <p className="text-[11px] text-white/50 text-center">
              Scrub to the moment of impact
            </p>

            {/* Frame scrubber */}
            <input
              type="range"
              min="0"
              max={totalFrames - 1}
              value={currentFrame}
              onChange={(e) => {
                const frame = Number(e.target.value)
                const video = document.querySelector('video')
                if (video) {
                  video.currentTime = frame / fps
                }
              }}
              className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
            />

            {/* Frame step controls - inline compact */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  const video = document.querySelector('video')
                  if (video) {
                    video.currentTime = Math.max(0, video.currentTime - 1/fps)
                  }
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors"
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="text-sm font-semibold text-[#FFD700] tabular-nums" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>
                {currentFrame} <span className="text-white/40">/ {totalFrames}</span>
              </div>

              <button
                onClick={() => {
                  const video = document.querySelector('video')
                  if (video) {
                    video.currentTime = Math.min(video.duration, video.currentTime + 1/fps)
                  }
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors"
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <button
              onClick={handleImpactConfirm}
              className="w-full py-2 rounded-lg bg-[#FFD700] text-black font-semibold text-xs hover:bg-[#FFD700]/90 transition-colors"
              style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
            >
              Set Impact Frame
            </button>
          </div>
        </div>
      )}

      {/* Start/End point instructions - compact pill */}
      {(mode === 'start' || mode === 'end') && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-sm">
          <p className="text-xs text-white/90" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>
            {mode === 'start' && 'Tap ball start position'}
            {mode === 'end' && 'Tap ball landing spot'}
          </p>
        </div>
      )}

      {/* Adjustment controls - ultra compact */}
      {mode === 'adjust' && (
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-black/95 backdrop-blur-sm py-3 px-3 border-t border-white/5">
          <div className="max-w-sm mx-auto space-y-2">
            {/* Sliders in a tight grid */}
            <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1.5 items-center text-[11px]">
              <span className="text-white/50 font-medium">Height</span>
              <input
                type="range"
                min="0"
                max="80"
                value={params.peakHeight * 100}
                onChange={(e) => setParams(p => ({ ...p, peakHeight: Number(e.target.value) / 100 }))}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
              <span className="text-white/70 tabular-nums w-8 text-right">{Math.round(params.peakHeight * 100)}%</span>

              <span className="text-white/50 font-medium">Curve</span>
              <input
                type="range"
                min="-100"
                max="100"
                value={params.curve * 100}
                onChange={(e) => setParams(p => ({ ...p, curve: Number(e.target.value) / 100 }))}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
              <span className="text-white/70 tabular-nums w-8 text-right">
                {params.curve > 0 ? `+${Math.round(params.curve * 100)}` :
                 params.curve < 0 ? `${Math.round(params.curve * 100)}` : '0'}
              </span>

              <span className="text-white/50 font-medium">Speed</span>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={params.ballSpeed}
                onChange={(e) => setParams(p => ({ ...p, ballSpeed: Number(e.target.value) }))}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
              <span className="text-white/70 tabular-nums w-8 text-right">{params.ballSpeed.toFixed(1)}x</span>

              <span className="text-white/50 font-medium">Hang</span>
              <input
                type="range"
                min="0"
                max="100"
                value={params.hangtime * 100}
                onChange={(e) => setParams(p => ({ ...p, hangtime: Number(e.target.value) / 100 }))}
                className="w-full h-1 bg-neutral-800 rounded-full appearance-none cursor-pointer"
              />
              <span className="text-white/70 tabular-nums w-8 text-right">{Math.round(params.hangtime * 100)}%</span>
            </div>

            {/* Color picker - compact */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[11px] text-white/50 font-medium">Color</span>
              <div className="flex gap-1.5 flex-1">
                {TRACER_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setParams(p => ({ ...p, color: c.value }))}
                    className={`w-5 h-5 rounded-full transition-transform ${
                      params.color === c.value
                        ? 'ring-2 ring-white ring-offset-1 ring-offset-black scale-110'
                        : 'opacity-50 hover:opacity-80'
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Action buttons - slim */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setMode('impact')
                  setParams(p => ({ ...p, startX: 0, startY: 0, endX: 0, endY: 0 }))
                  setPointsSet({ start: false, end: false })
                }}
                className="flex-1 py-1.5 rounded-lg bg-white/5 text-white/70 text-[11px] font-medium hover:bg-white/10 transition-colors"
                style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
              >
                Reset
              </button>
              <button
                onClick={handleComplete}
                className="flex-1 py-1.5 rounded-lg bg-[#FFD700] text-black text-[11px] font-semibold hover:bg-[#FFD700]/90 transition-colors"
                style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
              >
                Continue
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
