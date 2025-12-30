import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { TrackPoint, TracerStyle } from '../types'
import { drawTracer } from '../lib/tracer'

export interface VideoPlayerHandle {
  getCurrentFrame: () => number
  seekToFrame: (frame: number) => void
}

interface VideoPlayerProps {
  videoUrl: string
  points: TrackPoint[]
  fps?: number
  tracerStyle?: TracerStyle
  onFrameChange?: (frame: number) => void
  showStats?: boolean
  showFullTracer?: boolean
  children?: React.ReactNode
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({
  videoUrl,
  points,
  fps = 30,
  tracerStyle = {
    startColor: '#FFD700',
    endColor: '#FF4500',
    lineWidth: 4,
    glowIntensity: 10
  },
  onFrameChange,
  showStats = true,
  showFullTracer = false,
  children
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const controlsTimeoutRef = useRef<number>()

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    getCurrentFrame: () => currentFrame,
    seekToFrame: (frame: number) => {
      const video = videoRef.current
      if (video) {
        video.currentTime = frame / fps
      }
    }
  }), [currentFrame, fps])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleLoaded = () => {
      setTotalFrames(Math.floor(video.duration * fps))
    }

    video.addEventListener('loadedmetadata', handleLoaded)
    return () => video.removeEventListener('loadedmetadata', handleLoaded)
  }, [fps])

  // Smooth animation loop for tracer rendering
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const render = () => {
      const frame = Math.floor(video.currentTime * fps)

      if (frame !== currentFrame) {
        setCurrentFrame(frame)
        onFrameChange?.(frame)
      }

      // Update canvas size if needed
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }

      // Clear and draw tracer
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (points.length > 0) {
        // Show full trajectory only when paused and showFullTracer is enabled (editing mode)
        // During playback, always animate the tracer with the video
        const tracerFrame = (showFullTracer && video.paused)
          ? points[points.length - 1].frameIndex
          : frame
        drawTracer(ctx, points, tracerFrame, tracerStyle)
      }

      animationRef.current = requestAnimationFrame(render)
    }

    animationRef.current = requestAnimationFrame(render)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [fps, points, tracerStyle, onFrameChange, currentFrame, showFullTracer])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
    } else {
      video.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  const stepFrame = useCallback((delta: number) => {
    const video = videoRef.current
    if (!video) return

    video.pause()
    setIsPlaying(false)
    const newTime = Math.max(0, Math.min(video.duration, video.currentTime + delta / fps))
    video.currentTime = newTime
  }, [fps])

  const seekToProgress = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const video = videoRef.current
    const target = e.currentTarget as HTMLElement
    if (!video) return

    const rect = target.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    video.currentTime = progress * video.duration
  }, [])

  const handleInteraction = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlaying) setShowControls(false)
    }, 3000)
  }, [isPlaying])

  const progress = totalFrames > 0 ? currentFrame / totalFrames : 0

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black flex items-center justify-center"
      onClick={handleInteraction}
      onTouchStart={handleInteraction}
      onMouseMove={handleInteraction}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={videoUrl}
        className="absolute inset-0 w-full h-full object-contain"
        playsInline
        webkit-playsinline="true"
        muted
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedData={() => {
          // Force a render on iOS by seeking to start
          const video = videoRef.current
          if (video) {
            video.currentTime = 0.001
          }
        }}
      />

      {/* Tracer overlay canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
      />

      {/* Editor overlay slot */}
      {children}

      {/* Controls overlay */}
      <div
        className={`
          absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent
          transition-opacity duration-300 pt-20 pb-6 px-4
          ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
      >
        {/* Timeline scrubber */}
        <div
          className="relative h-12 flex items-center mb-4 touch-none cursor-pointer"
          onClick={seekToProgress}
          onMouseDown={seekToProgress}
          onTouchStart={seekToProgress}
          onTouchMove={seekToProgress}
        >
          {/* Track background */}
          <div className="absolute inset-x-0 h-1.5 bg-white/20 rounded-full" />

          {/* Progress fill */}
          <div
            className="absolute left-0 h-1.5 rounded-full bg-gradient-to-r from-[#FFD700] to-[#FF4500]"
            style={{ width: `${progress * 100}%` }}
          />

          {/* Scrubber handle */}
          <div
            className="absolute w-5 h-5 -translate-x-1/2 rounded-full bg-white shadow-lg shadow-black/50"
            style={{ left: `${progress * 100}%` }}
          >
            <div className="absolute inset-1 rounded-full bg-[#FFD700]" />
          </div>

          {/* Touch area expansion */}
          <div className="absolute inset-x-0 -inset-y-4" />
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-center gap-4">
          {/* Frame back */}
          <button
            onClick={(e) => { e.stopPropagation(); stepFrame(-1) }}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors touch-target"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay() }}
            className="w-16 h-16 flex items-center justify-center rounded-full bg-[#FFD700] hover:bg-[#FFD700]/90 active:scale-95 transition-all shadow-lg shadow-[#FFD700]/30 touch-target"
          >
            {isPlaying ? (
              <svg className="w-7 h-7 text-black" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg className="w-7 h-7 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Frame forward */}
          <button
            onClick={(e) => { e.stopPropagation(); stepFrame(1) }}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors touch-target"
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Frame counter */}
        <div className="absolute bottom-6 right-4 text-xs text-white/60 font-mono tabular-nums">
          {currentFrame} / {totalFrames}
        </div>
      </div>

      {/* Top status bar - only show if showStats is true and has points */}
      {showStats && points.length > 0 && (
        <div
          className={`
            absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent
            transition-opacity duration-300 pt-12 pb-16 px-4
            ${showControls ? 'opacity-100' : 'opacity-0'}
          `}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-[#FFD700]" />
              <span className="text-xs text-white/80">{points.filter(p => !p.isEstimated).length} detected</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-[#FF4500]" />
              <span className="text-xs text-white/80">{points.filter(p => p.isEstimated).length} estimated</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

VideoPlayer.displayName = 'VideoPlayer'
