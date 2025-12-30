import { useState, useCallback, useRef } from 'react'
import type { TrackPoint, TracerStyle } from '../types'

interface UseVideoExportReturn {
  isExporting: boolean
  progress: number
  error: Error | null
  exportVideo: (
    videoFile: File,
    video: HTMLVideoElement,
    points: TrackPoint[],
    sourceFps: number,
    style?: TracerStyle
  ) => Promise<void>
  cancelExport: () => void
}

// Modal endpoint - set via environment variable
const MODAL_ENDPOINT = import.meta.env.VITE_MODAL_ENDPOINT || ''

export function useVideoExport(): UseVideoExportReturn {
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const exportVideo = useCallback(async (
    videoFile: File,
    video: HTMLVideoElement,
    points: TrackPoint[],
    sourceFps: number,
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
    abortRef.current = new AbortController()

    try {
      // Convert video to base64
      setProgress(0.1)
      const videoBuffer = await videoFile.arrayBuffer()
      const videoBase64 = btoa(
        new Uint8Array(videoBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      setProgress(0.2)

      // Prepare request payload
      const payload = {
        video_base64: videoBase64,
        points: points.map(p => ({
          frameIndex: p.frameIndex,
          x: p.x,
          y: p.y
        })),
        fps: 60,  // Output at 60fps for smooth playback
        source_fps: sourceFps,  // FPS the frameIndex values are based on
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        style: {
          startColor: style.startColor,
          endColor: style.endColor,
          lineWidth: style.lineWidth,
          glowIntensity: style.glowIntensity
        }
      }

      setProgress(0.3)

      // Call Modal endpoint
      const response = await fetch(MODAL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal
      })

      setProgress(0.8)

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.error) {
        throw new Error(result.error)
      }

      setProgress(0.9)

      // Convert base64 response to blob and download
      const outputBytes = atob(result.video_base64)
      const outputArray = new Uint8Array(outputBytes.length)
      for (let i = 0; i < outputBytes.length; i++) {
        outputArray[i] = outputBytes.charCodeAt(i)
      }
      const outputBlob = new Blob([outputArray], { type: 'video/mp4' })

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
      if (err instanceof Error && err.name === 'AbortError') {
        setError(new Error('Export cancelled'))
      } else {
        const error = err instanceof Error ? err : new Error('Export failed')
        setError(error)
        throw error
      }
    } finally {
      setIsExporting(false)
    }
  }, [])

  const cancelExport = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    isExporting,
    progress,
    error,
    exportVideo,
    cancelExport
  }
}
