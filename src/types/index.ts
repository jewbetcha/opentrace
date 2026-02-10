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

export interface TracerStyle {
  startColor: string
  endColor: string
  lineWidth: number
  glowIntensity: number
}
