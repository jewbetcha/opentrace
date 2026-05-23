import { useState, useCallback } from 'react'
import { loadVideo, getVideoMetadata } from '../lib/video'
import type { VideoMetadata } from '../types'

interface UseVideoFramesReturn {
  video: HTMLVideoElement | null
  metadata: VideoMetadata | null
  isLoading: boolean
  error: Error | null
  loadVideoFile: (file: File) => Promise<void>
}

export function useVideoFrames(): UseVideoFramesReturn {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null)
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const loadVideoFile = useCallback(async (file: File) => {
    setIsLoading(true)
    setError(null)

    try {
      const loadedVideo = await loadVideo(file)
      const videoMetadata = await getVideoMetadata(loadedVideo)

      setVideo(loadedVideo)
      setMetadata(videoMetadata)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load video')
      setError(error)
      setVideo(null)
      setMetadata(null)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    video,
    metadata,
    isLoading,
    error,
    loadVideoFile
  }
}
