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


// =============================================================================
// TRACKMAN-STYLE CUBIC BEZIER TRAJECTORY
// =============================================================================
//
// Key characteristics from real Trackman:
// - Rise is nearly STRAIGHT (bullet-like trajectory)
// - Apex is SHARP (distinct peak)
// - Fall is STEEP and SHORT (drops almost vertically)
// - Apex occurs at ~80% of horizontal distance

export interface Point2D {
  x: number
  y: number
}

export interface BezierControlPoints {
  p0: Point2D  // Start
  p1: Point2D  // Launch control
  p2: Point2D  // Descent control
  p3: Point2D  // End
}

// === TRACKMAN CONSTANTS ===
// Centralized so all components use the same values
export const TRACKMAN = {
  // Control point positioning
  APEX_X_RATIO: 0.82,           // Apex at 82% of horizontal distance (long rise)
  LAUNCH_FACTOR_BASE: 0.45,     // Base launch factor (lowered for more hangtime range)
  LAUNCH_FACTOR_HANGTIME: 0.50, // Hangtime contribution (0.45 to 0.95 range)
  DESCENT_X_RATIO: 0.96,        // P2 at 96% horizontal (very close to end = steep drop)
  CURVE_FACTOR_P1: 0.03,        // Curve effect on launch control
  CURVE_FACTOR_P2: 0.05,        // Curve effect on descent control

  // Bezier t-mapping for "long rise, quick fall" effect
  // These control how the ball moves along the curve over time
  T_RISE_END: 0.50,             // Rise phase uses 0 to 0.50 of curve (50%)
  T_APEX_END: 0.85,             // Apex phase uses 0.50 to 0.85 of curve (35% hang time!)
  // Fall phase uses 0.85 to 1.0 (only 15% of curve = very steep fast drop)

  // Frame timing constants
  BASE_RISE_FRAMES: 50,         // Frames for rise
  HANGTIME_FRAMES: 70,          // Much more frames at apex (was 40)
  GRAVITY_SCALE: 8,             // Even faster fall (lower = fewer frames)
}

export interface TrackmanParams {
  startX: number
  startY: number
  endX: number
  endY: number
  peakHeight: number    // 0-1, affects apex height
  curve: number         // -1 to 1, draw/fade
  hangtime: number      // 0-1, affects launch angle and hang at apex
  videoWidth: number
  videoHeight: number
}

/**
 * Calculate Trackman-style cubic Bezier control points
 */
export function calculateTrackmanControlPoints(params: TrackmanParams): BezierControlPoints {
  const { startX, startY, endX, endY, peakHeight, curve, hangtime, videoWidth, videoHeight } = params

  const dx = endX - startX

  // Apex height in screen coords (up is negative Y)
  const apexHeight = peakHeight * videoHeight
  const apexY = Math.min(startY, endY) - apexHeight

  // Apex occurs at 80% of horizontal distance (Trackman style)
  const apexX = startX + dx * TRACKMAN.APEX_X_RATIO

  // P0: Start
  const p0 = { x: startX, y: startY }

  // P3: End
  const p3 = { x: endX, y: endY }

  // P1: Launch control - MUST use same factor for x and y for straight trajectory
  // launchFactor range: 0.55 to 0.90 based on hangtime
  const launchFactor = TRACKMAN.LAUNCH_FACTOR_BASE + hangtime * TRACKMAN.LAUNCH_FACTOR_HANGTIME
  const p1 = {
    x: startX + (apexX - startX) * launchFactor + curve * videoWidth * TRACKMAN.CURVE_FACTOR_P1,
    y: startY - apexHeight * launchFactor  // Same factor = straight line toward apex
  }

  // P2: Descent control - very close to end horizontally, but at apex height
  // This creates the sharp peak and steep drop
  const p2 = {
    x: startX + dx * TRACKMAN.DESCENT_X_RATIO + curve * videoWidth * TRACKMAN.CURVE_FACTOR_P2,
    y: apexY  // At apex height = sharp corner before dropping
  }

  return { p0, p1, p2, p3 }
}

/**
 * Evaluate cubic Bezier curve at parameter t
 * B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
 */
export function evaluateBezier(t: number, cp: BezierControlPoints): Point2D {
  const { p0, p1, p2, p3 } = cp
  const u = 1 - t
  const u2 = u * u
  const u3 = u2 * u
  const t2 = t * t
  const t3 = t2 * t

  return {
    x: u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
    y: u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y
  }
}

/**
 * Generate a full trajectory as an array of points
 */
export function generateBezierPoints(cp: BezierControlPoints, numPoints: number = 60): Point2D[] {
  const points: Point2D[] = []
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints
    points.push(evaluateBezier(t, cp))
  }
  return points
}

/**
 * Calculate physics-based frame timing for animation
 * Returns the t parameter for the Bezier curve based on frame index
 * Uses TRACKMAN constants for "long rise, quick fall" effect
 */
export function calculateBezierT(
  frameIndex: number,
  riseFrames: number,
  apexFrames: number,
  fallFrames: number
): number {
  const { T_RISE_END, T_APEX_END } = TRACKMAN
  const T_APEX_DURATION = T_APEX_END - T_RISE_END  // ~0.23
  const T_FALL_DURATION = 1.0 - T_APEX_END         // ~0.22

  if (frameIndex <= riseFrames) {
    // Rise phase: long straight trajectory up
    const riseProgress = frameIndex / riseFrames
    return riseProgress * T_RISE_END
  } else if (frameIndex <= riseFrames + apexFrames) {
    // Apex phase: ball hangs at the top
    const apexProgress = (frameIndex - riseFrames) / Math.max(1, apexFrames)
    return T_RISE_END + apexProgress * T_APEX_DURATION
  } else {
    // Fall phase: steep fast drop (compressed into small portion of curve)
    const fallProgress = (frameIndex - riseFrames - apexFrames) / fallFrames
    return T_APEX_END + fallProgress * T_FALL_DURATION
  }
}

/**
 * Calculate frame counts based on physics
 * Uses TRACKMAN constants for timing
 */
export function calculateFlightFrames(
  startY: number,
  apexY: number,
  endY: number,
  ballSpeed: number,
  hangtime: number
): { riseFrames: number; apexFrames: number; fallFrames: number; totalFrames: number } {
  const { BASE_RISE_FRAMES, HANGTIME_FRAMES, GRAVITY_SCALE } = TRACKMAN

  const rise = Math.max(10, startY - apexY)
  const fall = Math.max(10, endY - apexY)

  // Rise: more frames for longer upward trajectory
  const riseFrames = Math.max(5, Math.round((BASE_RISE_FRAMES / ballSpeed) * Math.sqrt(rise / 100)))

  // Apex: hangtime scales with BOTH slider AND apex height
  // Higher shots naturally have more hang time (ball moving slower at apex)
  const heightFactor = Math.sqrt(rise / 100)  // Higher apex = more hang
  const apexFrames = Math.round(hangtime * HANGTIME_FRAMES * (0.5 + heightFactor * 0.5))

  // Fall: gravity accelerates - fewer frames for quick drop
  const fallFrames = Math.max(3, Math.round(GRAVITY_SCALE * Math.sqrt(fall / 100)))

  const totalFrames = riseFrames + apexFrames + fallFrames

  return { riseFrames, apexFrames, fallFrames, totalFrames }
}
