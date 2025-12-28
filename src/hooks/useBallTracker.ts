import { useState, useCallback } from 'react'
import { trackBallAcrossFrames, smoothTrack } from '../lib/tracking'
import { estimateTrajectory } from '../lib/trajectory'
import type { Detection, TrackPoint } from '../types'

interface UseBallTrackerReturn {
  trackedPoints: TrackPoint[]
  isTracking: boolean
  track: (
    detections: Detection[][],
    videoWidth: number,
    videoHeight: number
  ) => TrackPoint[]
  updatePoint: (index: number, x: number, y: number) => void
  resetToOriginal: () => void
}

export function useBallTracker(): UseBallTrackerReturn {
  const [trackedPoints, setTrackedPoints] = useState<TrackPoint[]>([])
  const [originalPoints, setOriginalPoints] = useState<TrackPoint[]>([])
  const [isTracking, setIsTracking] = useState(false)

  const track = useCallback((
    detections: Detection[][],
    videoWidth: number,
    videoHeight: number
  ): TrackPoint[] => {
    setIsTracking(true)

    try {
      const rawTrack = trackBallAcrossFrames(detections)
      const smoothedTrack = smoothTrack(rawTrack, 3)
      const fullTrajectory = estimateTrajectory(smoothedTrack, videoWidth, videoHeight)

      setOriginalPoints([...fullTrajectory])
      setTrackedPoints(fullTrajectory)

      return fullTrajectory
    } finally {
      setIsTracking(false)
    }
  }, [])

  const updatePoint = useCallback((index: number, x: number, y: number) => {
    setTrackedPoints(prev => {
      const updated = [...prev]
      if (index >= 0 && index < updated.length) {
        updated[index] = { ...updated[index], x, y }
      }
      return updated
    })
  }, [])

  const resetToOriginal = useCallback(() => {
    setTrackedPoints([...originalPoints])
  }, [originalPoints])

  return {
    trackedPoints,
    isTracking,
    track,
    updatePoint,
    resetToOriginal
  }
}
