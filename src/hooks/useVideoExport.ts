import { useState, useCallback, useRef } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { drawTracer } from '../lib/tracer'
import type { TrackPoint, TracerStyle } from '../types'

interface UseVideoExportReturn {
  isExporting: boolean
  progress: number
  exportedUrl: string | null
  error: Error | null
  exportVideo: (
    video: HTMLVideoElement,
    points: TrackPoint[],
    fps: number,
    style?: TracerStyle
  ) => Promise<string>
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
  const [exportedUrl, setExportedUrl] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef(false)

  const exportVideo = useCallback(async (
    video: HTMLVideoElement,
    points: TrackPoint[],
    fps: number,
    style: TracerStyle = {
      startColor: '#FFD700',
      endColor: '#FF4500',
      lineWidth: 4,
      glowIntensity: 10
    }
  ): Promise<string> => {
    setIsExporting(true)
    setProgress(0)
    setError(null)
    abortRef.current = false

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!

    const duration = video.duration
    const totalFrames = Math.floor(duration * fps)

    try {
      // Load FFmpeg
      setProgress(0.01)
      const ff = await getFFmpeg()

      // Set up progress handler
      ff.on('progress', ({ progress: p }) => {
        // FFmpeg progress is for the encoding phase (last 20%)
        setProgress(0.8 + p * 0.2)
      })

      // Render frames
      for (let frame = 0; frame < totalFrames; frame++) {
        if (abortRef.current) {
          throw new Error('Export cancelled')
        }

        const time = frame / fps
        await seekVideo(video, time)

        // Draw video frame
        ctx.drawImage(video, 0, 0)

        // Draw tracer overlay
        drawTracer(ctx, points, frame, style)

        // Convert canvas to PNG blob
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png')
        })

        const arrayBuffer = await blob.arrayBuffer()
        const frameData = new Uint8Array(arrayBuffer)

        // Write frame to FFmpeg filesystem
        const frameName = `frame${frame.toString().padStart(6, '0')}.png`
        await ff.writeFile(frameName, frameData)

        setProgress((frame + 1) / totalFrames * 0.8)
      }

      // Encode to MOV using FFmpeg
      await ff.exec([
        '-framerate', fps.toString(),
        '-i', 'frame%06d.png',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-y',
        'output.mov'
      ])

      // Read the output file
      const data = await ff.readFile('output.mov')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outputBlob = new Blob([data as any], { type: 'video/quicktime' })
      const url = URL.createObjectURL(outputBlob)

      // Clean up frames
      for (let frame = 0; frame < totalFrames; frame++) {
        const frameName = `frame${frame.toString().padStart(6, '0')}.png`
        await ff.deleteFile(frameName)
      }
      await ff.deleteFile('output.mov')

      setExportedUrl(url)
      setProgress(1)
      return url
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
    exportedUrl,
    error,
    exportVideo,
    cancelExport
  }
}

async function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    // If already at the right time, resolve immediately
    if (Math.abs(video.currentTime - time) < 0.001) {
      resolve()
      return
    }

    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = time
  })
}
