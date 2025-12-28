import type { Detection, TrackPoint, BoundingBox } from '../types'

interface TrackState {
  points: TrackPoint[]
  lastVelocity: { vx: number; vy: number } | null
  framesLost: number
}

const MAX_FRAMES_LOST = 3
const MAX_DISTANCE_THRESHOLD = 100
const MIN_TRACK_LENGTH = 3

export function trackBallAcrossFrames(
  detections: Detection[][]
): TrackPoint[] {
  if (detections.length === 0) return []

  const state: TrackState = {
    points: [],
    lastVelocity: null,
    framesLost: 0
  }

  for (let frameIndex = 0; frameIndex < detections.length; frameIndex++) {
    const frameDetections = detections[frameIndex]
    const bestMatch = findBestMatch(state, frameDetections, frameIndex)

    if (bestMatch) {
      state.points.push({
        frameIndex,
        x: bestMatch.centerX,
        y: bestMatch.centerY,
        confidence: bestMatch.box.confidence,
        isEstimated: false
      })

      if (state.points.length >= 2) {
        const prev = state.points[state.points.length - 2]
        const curr = state.points[state.points.length - 1]
        state.lastVelocity = {
          vx: curr.x - prev.x,
          vy: curr.y - prev.y
        }
      }

      state.framesLost = 0
    } else {
      state.framesLost++

      if (state.framesLost > MAX_FRAMES_LOST && state.points.length >= MIN_TRACK_LENGTH) {
        break
      }
    }
  }

  return state.points
}

function findBestMatch(
  state: TrackState,
  detections: Detection[],
  frameIndex: number
): Detection | null {
  if (detections.length === 0) return null

  if (state.points.length === 0) {
    return detections.reduce((best, det) =>
      det.box.confidence > best.box.confidence ? det : best
    )
  }

  const lastPoint = state.points[state.points.length - 1]
  let predictedX = lastPoint.x
  let predictedY = lastPoint.y

  if (state.lastVelocity) {
    const framesDiff = frameIndex - lastPoint.frameIndex
    predictedX += state.lastVelocity.vx * framesDiff
    predictedY += state.lastVelocity.vy * framesDiff
  }

  let bestMatch: Detection | null = null
  let bestScore = Infinity

  for (const det of detections) {
    const dist = Math.sqrt(
      Math.pow(det.centerX - predictedX, 2) +
      Math.pow(det.centerY - predictedY, 2)
    )

    if (dist > MAX_DISTANCE_THRESHOLD) continue

    const score = dist / det.box.confidence

    if (score < bestScore) {
      bestScore = score
      bestMatch = det
    }
  }

  return bestMatch
}

export function detectionsFromBoxes(
  frameIndex: number,
  boxes: BoundingBox[]
): Detection[] {
  return boxes.map(box => ({
    frameIndex,
    box,
    centerX: box.x + box.width / 2,
    centerY: box.y + box.height / 2
  }))
}

export function smoothTrack(points: TrackPoint[], windowSize: number = 3): TrackPoint[] {
  if (points.length < windowSize) return points

  const smoothed: TrackPoint[] = []
  const halfWindow = Math.floor(windowSize / 2)

  for (let i = 0; i < points.length; i++) {
    const start = Math.max(0, i - halfWindow)
    const end = Math.min(points.length - 1, i + halfWindow)

    let sumX = 0
    let sumY = 0
    let count = 0

    for (let j = start; j <= end; j++) {
      sumX += points[j].x
      sumY += points[j].y
      count++
    }

    smoothed.push({
      ...points[i],
      x: sumX / count,
      y: sumY / count
    })
  }

  return smoothed
}
