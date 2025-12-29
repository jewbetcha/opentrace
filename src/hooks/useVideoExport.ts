import { useState, useCallback, useRef } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { drawTracer } from '../lib/tracer'
import type { TrackPoint, TracerStyle } from '../types'

interface UseVideoExportReturn {
  isExporting: boolean
  progress: number
  error: Error | null
  exportVideo: (
    videoFile: File,
    video: HTMLVideoElement,
    points: TrackPoint[],
    fps: number,
    style?: TracerStyle
  ) => Promise<void>
  cancelExport: () => void
}

let ffmpeg: FFmpeg | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg === null) {
    ffmpeg = new FFmpeg()
    await ffmpeg.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
    })
  }
  return ffmpeg
}

// Create high-quality canvas context optimized for export
function createExportCanvas(width: number, height: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
  // Try OffscreenCanvas for potential GPU acceleration
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true, // Hint for GPU acceleration
      })
      if (ctx) {
        // Enable high-quality image rendering
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        return { canvas, ctx }
      }
    } catch {
      // Fall through to regular canvas
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: true // Optimize for frequent readback
  })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return { canvas, ctx }
}

// Check if WebCodecs is available
function hasWebCodecs(): boolean {
  return typeof VideoDecoder !== 'undefined' && typeof VideoFrame !== 'undefined'
}

export function useVideoExport(): UseVideoExportReturn {
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef(false)

  const exportVideo = useCallback(async (
    videoFile: File,
    video: HTMLVideoElement,
    points: TrackPoint[],
    fps: number,
    style: TracerStyle = {
      startColor: '#FFD700',
      endColor: '#FF4500',
      lineWidth: 4,
      glowIntensity: 10
    }
  ): Promise<void> => {
    setIsExporting(true)
    setProgress(0)
    setError(null)
    abortRef.current = false

    // Create high-quality canvas for export
    const { canvas, ctx } = createExportCanvas(video.videoWidth, video.videoHeight)

    const duration = video.duration
    const totalFrames = Math.floor(duration * fps)

    try {
      // Load FFmpeg
      setProgress(0.02)
      const ff = await getFFmpeg()

      ff.on('progress', ({ progress: p }) => {
        setProgress(0.85 + p * 0.15)
      })

      let frames: Uint8Array[] = []

      // Try WebCodecs for frame-accurate extraction
      if (hasWebCodecs()) {
        try {
          frames = await extractFramesWebCodecs(videoFile, canvas, ctx, points, fps, totalFrames, style, setProgress, abortRef)
        } catch (e) {
          console.warn('WebCodecs failed, falling back to video element:', e)
          frames = await extractFramesFallback(video, canvas, ctx, points, fps, totalFrames, style, setProgress, abortRef)
        }
      } else {
        frames = await extractFramesFallback(video, canvas, ctx, points, fps, totalFrames, style, setProgress, abortRef)
      }

      if (abortRef.current) {
        throw new Error('Export cancelled')
      }

      // Write all frames to FFmpeg filesystem (PNG for lossless quality)
      for (let i = 0; i < frames.length; i++) {
        const frameName = `frame${i.toString().padStart(6, '0')}.png`
        await ff.writeFile(frameName, frames[i])
      }
      setProgress(0.82)

      // Calculate a high bitrate based on resolution (aim for ~15-20 Mbps for 1080p)
      const pixels = video.videoWidth * video.videoHeight
      const baseBitrate = Math.max(8, Math.round((pixels / (1920 * 1080)) * 18))
      const bitrate = `${baseBitrate}M`

      // Encode to MP4 using FFmpeg with maximum quality settings
      // Using CRF 12 for near-lossless quality and high bitrate cap
      await ff.exec([
        '-framerate', fps.toString(),
        '-i', 'frame%06d.png',
        '-c:v', 'libx264',
        '-preset', 'slow',        // Better compression, higher quality
        '-crf', '12',             // Near-lossless quality (lower = better, 0-51 range)
        '-maxrate', bitrate,      // Maximum bitrate cap
        '-bufsize', `${baseBitrate * 2}M`, // Buffer size for rate control
        '-pix_fmt', 'yuv420p',    // Compatibility
        '-movflags', '+faststart', // Fast web playback
        '-profile:v', 'high',     // H.264 High Profile for better quality
        '-level', '4.2',          // High compatibility level
        '-r', fps.toString(),
        '-y',
        'output.mp4'
      ])

      // Read the output file
      const data = await ff.readFile('output.mp4')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outputBlob = new Blob([data as any], { type: 'video/mp4' })

      // Clean up frames
      for (let i = 0; i < frames.length; i++) {
        const frameName = `frame${i.toString().padStart(6, '0')}.png`
        await ff.deleteFile(frameName)
      }
      await ff.deleteFile('output.mp4')

      // Auto-download the file
      const url = URL.createObjectURL(outputBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'traced-shot.mp4'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      // Clean up URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      setProgress(1)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Export failed')
      setError(error)
      throw error
    } finally {
      setIsExporting(false)
    }
  }, [])

  const cancelExport = useCallback(() => {
    abortRef.current = true
  }, [])

  return {
    isExporting,
    progress,
    error,
    exportVideo,
    cancelExport
  }
}

// Helper to convert canvas to PNG blob
async function canvasToPngBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return await canvas.convertToBlob({ type: 'image/png' })
  }
  return new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png')
  })
}

// WebCodecs-based frame extraction (frame-accurate)
async function extractFramesWebCodecs(
  videoFile: File,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: TrackPoint[],
  fps: number,
  totalFrames: number,
  style: TracerStyle,
  setProgress: (p: number) => void,
  abortRef: React.MutableRefObject<boolean>
): Promise<Uint8Array[]> {
  const frames: Uint8Array[] = []

  // Create a video element for frame extraction
  const arrayBuffer = await videoFile.arrayBuffer()
  const videoBlob = new Blob([arrayBuffer], { type: videoFile.type })
  const videoUrl = URL.createObjectURL(videoBlob)

  const tempVideo = document.createElement('video')
  tempVideo.src = videoUrl
  tempVideo.muted = true
  tempVideo.preload = 'auto'

  await new Promise<void>((resolve) => {
    tempVideo.onloadeddata = () => resolve()
    tempVideo.load()
  })

  // Extract frames using VideoFrame for accurate capture
  for (let frame = 0; frame < totalFrames; frame++) {
    if (abortRef.current) break

    const targetTime = frame / fps
    tempVideo.currentTime = targetTime

    await new Promise<void>((resolve) => {
      tempVideo.onseeked = () => resolve()
    })

    // Use VideoFrame for accurate capture
    try {
      const videoFrame = new VideoFrame(tempVideo, { timestamp: targetTime * 1000000 })
      ctx.drawImage(videoFrame, 0, 0)
      videoFrame.close()
    } catch {
      // Fallback to direct draw
      ctx.drawImage(tempVideo, 0, 0)
    }

    // Draw tracer overlay
    drawTracer(ctx as CanvasRenderingContext2D, points, frame, style)

    // Convert to PNG for lossless quality
    const blob = await canvasToPngBlob(canvas)
    frames.push(new Uint8Array(await blob.arrayBuffer()))

    setProgress((frame + 1) / totalFrames * 0.8)
  }

  URL.revokeObjectURL(videoUrl)
  return frames
}

// Fallback extraction using video element
async function extractFramesFallback(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  points: TrackPoint[],
  fps: number,
  totalFrames: number,
  style: TracerStyle,
  setProgress: (p: number) => void,
  abortRef: React.MutableRefObject<boolean>
): Promise<Uint8Array[]> {
  const frames: Uint8Array[] = []

  video.pause()
  video.currentTime = 0

  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve()
  })

  for (let frame = 0; frame < totalFrames; frame++) {
    if (abortRef.current) break

    const targetTime = frame / fps
    video.currentTime = targetTime

    await new Promise<void>((resolve) => {
      video.onseeked = () => {
        // Extra frame to ensure rendering
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve())
        })
      }
    })

    ctx.drawImage(video, 0, 0)
    drawTracer(ctx as CanvasRenderingContext2D, points, frame, style)

    // Convert to PNG for lossless quality
    const blob = await canvasToPngBlob(canvas)
    frames.push(new Uint8Array(await blob.arrayBuffer()))

    setProgress((frame + 1) / totalFrames * 0.8)
  }

  return frames
}
