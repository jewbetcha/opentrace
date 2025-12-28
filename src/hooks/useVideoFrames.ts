import { useState, useCallback } from 'react'
import { loadVideo, getVideoMetadata, extractFrames } from '../lib/video'
import type { VideoMetadata } from '../types'

interface UseVideoFramesReturn {
  video: HTMLVideoElement | null
  metadata: VideoMetadata | null
  frames: ImageData[]
  isLoading: boolean
  progress: { current: number; total: number }
  error: Error | null
  loadVideoFile: (file: File) => Promise<void>
  extractAllFrames: (fps?: number) => Promise<ImageData[]>
}

export function useVideoFrames(): UseVideoFramesReturn {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null)
  const [frames, setFrames] = useState<ImageData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState<Error | null>(null)

  const loadVideoFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setError(null)

    try {
      const loadedVideo = await loadVideo(file)
      const videoMetadata = await getVideoMetadata(loadedVideo)

      setVideo(loadedVideo)
      setMetadata(videoMetadata)
      setProgress({ current: 0, total: videoMetadata.frameCount })
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load video'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const extractAllFrames = useCallback(async (fps: number = 30): Promise<ImageData[]> => {
    if (!video) {
      throw new Error('No video loaded')
    }

    setIsLoading(true)
    setError(null)

    try {
      const extractedFrames = await extractFrames(video, fps, (current, total) => {
        setProgress({ current, total })
      })

      setFrames(extractedFrames)
      return extractedFrames
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to extract frames')
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [video])

  return {
    video,
    metadata,
    frames,
    isLoading,
    progress,
    error,
    loadVideoFile,
    extractAllFrames
  }
}
