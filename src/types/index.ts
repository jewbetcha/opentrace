export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

export interface Detection {
  frameIndex: number
  box: BoundingBox
  centerX: number
  centerY: number
}

export interface TrackPoint {
  frameIndex: number
  x: number
  y: number
  confidence: number
  isEstimated: boolean
}

export interface VideoMetadata {
  width: number
  height: number
  duration: number
  fps: number
  frameCount: number
}

export interface ProcessingProgress {
  stage: 'loading' | 'extracting' | 'detecting' | 'tracking' | 'complete'
  current: number
  total: number
  message: string
}

export type AppState =
  | { type: 'idle' }
  | { type: 'processing'; progress: ProcessingProgress }
  | { type: 'editing'; videoUrl: string; points: TrackPoint[]; metadata: VideoMetadata }
  | { type: 'exporting'; progress: number }
  | { type: 'complete'; downloadUrl: string }

export interface TracerStyle {
  startColor: string
  endColor: string
  lineWidth: number
  glowIntensity: number
}

export const DEFAULT_TRACER_STYLE: TracerStyle = {
  startColor: '#FFD700',
  endColor: '#FF4500',
  lineWidth: 4,
  glowIntensity: 10
}
