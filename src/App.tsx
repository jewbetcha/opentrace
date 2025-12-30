import { useState, useCallback, useEffect, useRef } from 'react'
import { VideoUploader } from './components/VideoUploader'
import { VideoPlayer, VideoPlayerHandle } from './components/VideoPlayer'
import { TraceEditor } from './components/TraceEditor'
import { ExportButton } from './components/ExportButton'
import { ManualTracerCreator } from './components/ManualTracerCreator'
import { useVideoFrames } from './hooks/useVideoFrames'
import { useVideoExport } from './hooks/useVideoExport'
import type { TrackPoint, VideoMetadata } from './types'

type AppState =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'creating' }
  | { type: 'editing' }
  | { type: 'exporting' }
  | { type: 'complete' }

// Toast notification type
interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

export default function App() {
  const [appState, setAppState] = useState<AppState>({ type: 'idle' })
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null)
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [currentFrame, setCurrentFrame] = useState(0)
  const [tracerColor, setTracerColor] = useState('#3B82F6')
  const [tracerSpeed, setTracerSpeed] = useState(1.0)
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, type, message }])
    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const containerRef = useRef<HTMLDivElement>(null)
  const videoPlayerRef = useRef<VideoPlayerHandle>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  const { video, metadata: videoMeta, loadVideoFile } = useVideoFrames()
  const { exportVideo, isExporting, progress: exportProgress, cancelExport } = useVideoExport()

  // Update container size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [appState])

  // Update metadata when video loads
  useEffect(() => {
    if (videoMeta) {
      setMetadata(videoMeta)
    }
  }, [videoMeta])

  const handleUpload = useCallback(async (file: File) => {
    setVideoUrl(URL.createObjectURL(file))
    setVideoFile(file)
    setAppState({ type: 'loading' })

    try {
      await loadVideoFile(file)
      setAppState({ type: 'creating' })
    } catch (err) {
      console.error('Failed to load video:', err)
      setAppState({ type: 'idle' })
    }
  }, [loadVideoFile])

  const handleFrameChange = useCallback((frame: number) => {
    setCurrentFrame(frame)
  }, [])

  const handleSeekToFrame = useCallback((frame: number) => {
    videoPlayerRef.current?.seekToFrame(frame)
  }, [])

  const handleTracerComplete = useCallback((newPoints: TrackPoint[], color: string, ballSpeed: number) => {
    setPoints(newPoints)
    setTracerColor(color)
    setTracerSpeed(ballSpeed)
    setAppState({ type: 'editing' })
  }, [])

  const handlePointsUpdate = useCallback((newPoints: TrackPoint[]) => {
    setPoints(newPoints)
  }, [])

  const handleReset = useCallback(() => {
    setAppState({ type: 'creating' })
    setPoints([])
    setTracerSpeed(1.0)
  }, [])

  const handleColorChange = useCallback((color: string) => {
    setTracerColor(color)
  }, [])

  const handleExport = useCallback(async () => {
    if (!video || !metadata || !videoFile) return

    setAppState({ type: 'exporting' })

    try {
      // Pass source FPS so Modal can scale frame indices correctly
      await exportVideo(videoFile, video, points, metadata.fps, {
        startColor: tracerColor,
        endColor: tracerColor,
        lineWidth: 4,
        glowIntensity: 10
      })
      // Success! On iOS, file goes to Downloads in Files app
      showToast('success', 'Video saved to Downloads!')
      setAppState({ type: 'editing' })
    } catch (err) {
      console.error('Export failed:', err)
      const message = err instanceof Error ? err.message : 'Export failed'
      showToast('error', message)
      setAppState({ type: 'editing' })
    }
  }, [video, videoFile, points, metadata, tracerColor, exportVideo, showToast])

  const handleStartOver = useCallback(() => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl)
    }
    setVideoUrl(null)
    setVideoFile(null)
    setMetadata(null)
    setPoints([])
    setCurrentFrame(0)
    setTracerColor('#3B82F6')
    setAppState({ type: 'idle' })
  }, [videoUrl])

  // Render based on state
  if (appState.type === 'idle') {
    return <VideoUploader onUpload={handleUpload} />
  }

  if (appState.type === 'loading') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#0a0a0a]">
        <div className="w-12 h-12 border-4 border-[#FFD700] border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-neutral-400" style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}>
          Loading video...
        </p>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap');
        `}</style>
      </div>
    )
  }

  if (appState.type === 'creating' && videoUrl && metadata) {
    return (
      <div className="fixed inset-0 flex flex-col bg-[#0a0a0a]">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 bg-black/50 backdrop-blur-sm z-30">
          <button
            onClick={handleStartOver}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors touch-target"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-sm font-medium hidden sm:inline">Cancel</span>
          </button>

          <h1
            className="text-lg font-semibold text-white"
            style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
          >
            Create Tracer
          </h1>

          <div className="w-20" />
        </header>

        {/* Video with manual tracer overlay */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden">
          <VideoPlayer
            ref={videoPlayerRef}
            videoUrl={videoUrl}
            points={[]}
            fps={metadata.fps}
            onFrameChange={handleFrameChange}
            showStats={false}
          >
            <ManualTracerCreator
              videoWidth={metadata.width}
              videoHeight={metadata.height}
              containerWidth={containerSize.width}
              containerHeight={containerSize.height}
              fps={metadata.fps}
              totalFrames={metadata.frameCount}
              currentFrame={currentFrame}
              onSeekToFrame={handleSeekToFrame}
              onComplete={handleTracerComplete}
            />
          </VideoPlayer>
        </div>

        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap');
        `}</style>
      </div>
    )
  }

  if ((appState.type === 'editing' || appState.type === 'exporting' || appState.type === 'complete') && videoUrl && metadata) {
    return (
      <div className="fixed inset-0 flex flex-col bg-[#0a0a0a]">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 bg-black/50 backdrop-blur-sm z-30">
          <button
            onClick={handleStartOver}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors touch-target"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="text-sm font-medium hidden sm:inline">New Video</span>
          </button>

          <h1
            className="text-lg font-semibold text-white"
            style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
          >
            OpenTrace
          </h1>

          <div className="w-20" />
        </header>

        {/* Video player area */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden">
          <VideoPlayer
            videoUrl={videoUrl}
            points={points}
            fps={metadata.fps}
            tracerStyle={{
              startColor: tracerColor,
              endColor: tracerColor,
              lineWidth: 4,
              glowIntensity: 10
            }}
            showStats={false}
            showFullTracer={true}
          >
            <TraceEditor
              points={points}
              videoWidth={metadata.width}
              videoHeight={metadata.height}
              containerWidth={containerSize.width}
              containerHeight={containerSize.height}
              totalFrames={metadata.frameCount}
              tracerColor={tracerColor}
              initialBallSpeed={tracerSpeed}
              onPointsUpdate={handlePointsUpdate}
              onColorChange={handleColorChange}
              onReset={handleReset}
              enabled={appState.type === 'editing'}
            />
          </VideoPlayer>
        </div>

        {/* Export section - compact */}
        <div className="px-3 py-3 bg-black/80 backdrop-blur-sm border-t border-white/5">
          <div className="flex justify-center">
            <ExportButton
              onExport={handleExport}
              isExporting={isExporting}
              progress={exportProgress}
              onCancel={cancelExport}
            />
          </div>
        </div>

        {/* Toast notifications */}
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`
                px-4 py-2.5 rounded-xl backdrop-blur-sm shadow-lg
                flex items-center gap-2 animate-slide-down
                ${toast.type === 'success'
                  ? 'bg-green-500/90 text-white'
                  : 'bg-red-500/90 text-white'
                }
              `}
              style={{ fontFamily: 'Outfit, system-ui, sans-serif' }}
            >
              {toast.type === 'success' ? (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
          ))}
        </div>

        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap');

          @keyframes slide-down {
            from {
              opacity: 0;
              transform: translateY(-10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .animate-slide-down {
            animation: slide-down 0.2s ease-out;
          }
        `}</style>
      </div>
    )
  }

  return null
}
