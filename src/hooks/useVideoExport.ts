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

    const width = video.videoWidth
    const height = video.videoHeight
    const duration = video.duration
    const totalFrames = Math.floor(duration * fps)

    // Create high-quality canvas at full video resolution
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { alpha: false })!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    try {
      // Load FFmpeg
      setProgress(0.02)
      const ff = await getFFmpeg()

      ff.on('progress', ({ progress: p }) => {
        setProgress(0.85 + p * 0.15)
      })

      if (abortRef.current) throw new Error('Export cancelled')

      // Extract frames with tracer overlay
      const frames: Uint8Array[] = []

      // Use a separate video element for frame-accurate extraction
      const tempVideo = document.createElement('video')
      tempVideo.src = URL.createObjectURL(videoFile)
      tempVideo.muted = true
      tempVideo.preload = 'auto'

      await new Promise<void>((resolve, reject) => {
        tempVideo.onloadeddata = () => resolve()
        tempVideo.onerror = () => reject(new Error('Failed to load video'))
        tempVideo.load()
      })

      for (let frame = 0; frame < totalFrames; frame++) {
        if (abortRef.current) break

        const targetTime = frame / fps

        // Seek to exact frame
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            tempVideo.removeEventListener('seeked', onSeeked)
            // Wait for frame to be ready
            requestAnimationFrame(() => {
              requestAnimationFrame(() => resolve())
            })
          }
          tempVideo.addEventListener('seeked', onSeeked)
          tempVideo.currentTime = targetTime
        })

        // Draw video frame at full resolution
        ctx.drawImage(tempVideo, 0, 0, width, height)

        // Draw tracer overlay
        drawTracer(ctx, points, frame, style)

        // Convert to PNG (lossless)
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png')
        })
        frames.push(new Uint8Array(await blob.arrayBuffer()))

        setProgress((frame + 1) / totalFrames * 0.80)
      }

      // Clean up temp video
      URL.revokeObjectURL(tempVideo.src)

      if (abortRef.current) throw new Error('Export cancelled')

      // Write frames to FFmpeg
      for (let i = 0; i < frames.length; i++) {
        const frameName = `frame${i.toString().padStart(6, '0')}.png`
        await ff.writeFile(frameName, frames[i])
      }
      setProgress(0.82)

      // Encode with maximum quality settings
      await ff.exec([
        '-framerate', fps.toString(),
        '-i', 'frame%06d.png',
        '-c:v', 'libx264',
        '-preset', 'slow',
        '-crf', '12',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-r', fps.toString(),
        '-y',
        'output.mp4'
      ])

      // Read output
      const data = await ff.readFile('output.mp4')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outputBlob = new Blob([data as any], { type: 'video/mp4' })

      // Clean up
      for (let i = 0; i < frames.length; i++) {
        await ff.deleteFile(`frame${i.toString().padStart(6, '0')}.png`)
      }
      await ff.deleteFile('output.mp4')

      // Download
      const url = URL.createObjectURL(outputBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'traced-shot.mp4'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
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
