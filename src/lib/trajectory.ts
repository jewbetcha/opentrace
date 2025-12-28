import type { TrackPoint } from '../types'

const GRAVITY = 0.5
const POINTS_FOR_FIT = 5
const ESTIMATED_FRAMES = 60

export function estimateTrajectory(
  detectedPoints: TrackPoint[],
  videoWidth: number,
  videoHeight: number
): TrackPoint[] {
  if (detectedPoints.length < 3) {
    return detectedPoints
  }

  const lastPoints = detectedPoints.slice(-POINTS_FOR_FIT)
  const { vx, vy } = calculateVelocity(lastPoints)

  const lastPoint = detectedPoints[detectedPoints.length - 1]
  const estimatedPoints: TrackPoint[] = []

  let x = lastPoint.x
  let y = lastPoint.y
  let velocityY = vy

  for (let i = 1; i <= ESTIMATED_FRAMES; i++) {
    x += vx
    velocityY += GRAVITY
    y += velocityY

    if (x < 0 || x > videoWidth || y < 0 || y > videoHeight) {
      break
    }

    estimatedPoints.push({
      frameIndex: lastPoint.frameIndex + i,
      x,
      y,
      confidence: Math.max(0.1, 1 - (i / ESTIMATED_FRAMES)),
      isEstimated: true
    })
  }

  return [...detectedPoints, ...estimatedPoints]
}

function calculateVelocity(points: TrackPoint[]): { vx: number; vy: number } {
  if (points.length < 2) {
    return { vx: 0, vy: 0 }
  }

  let sumVx = 0
  let sumVy = 0

  for (let i = 1; i < points.length; i++) {
    const frameDiff = points[i].frameIndex - points[i - 1].frameIndex
    if (frameDiff > 0) {
      sumVx += (points[i].x - points[i - 1].x) / frameDiff
      sumVy += (points[i].y - points[i - 1].y) / frameDiff
    }
  }

  const count = points.length - 1
  return {
    vx: sumVx / count,
    vy: sumVy / count
  }
}

export function fitParabola(points: TrackPoint[]): (x: number) => number {
  if (points.length < 3) {
    return () => 0
  }

  const n = points.length
  let sumX = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0
  let sumY = 0, sumXY = 0, sumX2Y = 0

  for (const p of points) {
    const x = p.x
    const y = p.y
    sumX += x
    sumX2 += x * x
    sumX3 += x * x * x
    sumX4 += x * x * x * x
    sumY += y
    sumXY += x * y
    sumX2Y += x * x * y
  }

  const matrix = [
    [n, sumX, sumX2, sumY],
    [sumX, sumX2, sumX3, sumXY],
    [sumX2, sumX3, sumX4, sumX2Y]
  ]

  for (let i = 0; i < 3; i++) {
    let maxRow = i
    for (let k = i + 1; k < 3; k++) {
      if (Math.abs(matrix[k][i]) > Math.abs(matrix[maxRow][i])) {
        maxRow = k
      }
    }
    [matrix[i], matrix[maxRow]] = [matrix[maxRow], matrix[i]]

    for (let k = i + 1; k < 3; k++) {
      const factor = matrix[k][i] / matrix[i][i]
      for (let j = i; j < 4; j++) {
        matrix[k][j] -= factor * matrix[i][j]
      }
    }
  }

  const c = matrix[2][3] / matrix[2][2]
  const b = (matrix[1][3] - matrix[1][2] * c) / matrix[1][1]
  const a = (matrix[0][3] - matrix[0][2] * c - matrix[0][1] * b) / matrix[0][0]

  return (x: number) => a + b * x + c * x * x
}

export function interpolatePoints(points: TrackPoint[], numPoints: number): TrackPoint[] {
  if (points.length < 2) return points

  const result: TrackPoint[] = []
  const totalLength = points.length - 1

  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1)
    const index = t * totalLength
    const lowerIndex = Math.floor(index)
    const upperIndex = Math.min(lowerIndex + 1, points.length - 1)
    const localT = index - lowerIndex

    const p1 = points[lowerIndex]
    const p2 = points[upperIndex]

    result.push({
      frameIndex: Math.round(p1.frameIndex + (p2.frameIndex - p1.frameIndex) * localT),
      x: p1.x + (p2.x - p1.x) * localT,
      y: p1.y + (p2.y - p1.y) * localT,
      confidence: p1.confidence + (p2.confidence - p1.confidence) * localT,
      isEstimated: localT > 0.5 ? p2.isEstimated : p1.isEstimated
    })
  }

  return result
}
