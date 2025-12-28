import { useState, useCallback, useRef } from 'react'
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
    style?: TracerStyle
  ) => Promise<string>
  cancelExport: () => void
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

    const fps = 30
    const duration = video.duration
    const totalFrames = Math.floor(duration * fps)

    const stream = canvas.captureStream(fps)
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 8000000
    })

    const chunks: Blob[] = []
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const recordingComplete = new Promise<string>((resolve, reject) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        setExportedUrl(url)
        resolve(url)
      }
      mediaRecorder.onerror = () => reject(new Error('Recording failed'))
    })

    mediaRecorder.start()

    try {
      for (let frame = 0; frame < totalFrames; frame++) {
        if (abortRef.current) {
          mediaRecorder.stop()
          throw new Error('Export cancelled')
        }

        const time = frame / fps
        await seekVideo(video, time)

        ctx.drawImage(video, 0, 0)

        drawTracer(ctx, points, frame, style)

        setProgress((frame + 1) / totalFrames)

        await new Promise(resolve => setTimeout(resolve, 1000 / fps))
      }

      mediaRecorder.stop()
      return await recordingComplete
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
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = time
  })
}
