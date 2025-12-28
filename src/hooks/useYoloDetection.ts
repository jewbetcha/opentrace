import { useState, useCallback, useRef } from 'react'
import { loadModel, detectBalls, isModelLoaded } from '../lib/onnx'
import { detectionsFromBoxes } from '../lib/tracking'
import type { Detection } from '../types'

interface UseYoloDetectionReturn {
  isModelLoading: boolean
  isDetecting: boolean
  modelLoaded: boolean
  progress: { current: number; total: number }
  error: Error | null
  loadYoloModel: (modelPath: string) => Promise<void>
  detectInFrames: (frames: ImageData[]) => Promise<Detection[][]>
}

export function useYoloDetection(): UseYoloDetectionReturn {
  const [isModelLoading, setIsModelLoading] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef(false)

  const loadYoloModel = useCallback(async (modelPath: string) => {
    if (isModelLoaded()) {
      setModelLoaded(true)
      return
    }

    setIsModelLoading(true)
    setError(null)

    try {
      await loadModel(modelPath)
      setModelLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load model'))
      throw err
    } finally {
      setIsModelLoading(false)
    }
  }, [])

  const detectInFrames = useCallback(async (frames: ImageData[]): Promise<Detection[][]> => {
    if (!isModelLoaded()) {
      throw new Error('Model not loaded')
    }

    setIsDetecting(true)
    setError(null)
    setProgress({ current: 0, total: frames.length })
    abortRef.current = false

    const allDetections: Detection[][] = []

    try {
      for (let i = 0; i < frames.length; i++) {
        if (abortRef.current) break

        const boxes = await detectBalls(frames[i])
        const detections = detectionsFromBoxes(i, boxes)
        allDetections.push(detections)

        setProgress({ current: i + 1, total: frames.length })

        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }

      return allDetections
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Detection failed')
      setError(error)
      throw error
    } finally {
      setIsDetecting(false)
    }
  }, [])

  return {
    isModelLoading,
    isDetecting,
    modelLoaded,
    progress,
    error,
    loadYoloModel,
    detectInFrames
  }
}
