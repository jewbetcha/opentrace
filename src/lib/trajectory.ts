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

export const TRACKMAN = {
  APEX_X_RATIO: 0.78,
  LAUNCH_FACTOR_BASE: 0.42,
  LAUNCH_FACTOR_HANGTIME: 0.38,
  DESCENT_X_RATIO: 0.97,
  CURVE_FACTOR_P1: 0.025,
  CURVE_FACTOR_P2: 0.055,

  T_RISE_END: 0.58,
  T_APEX_END: 0.86,

  MIN_FLIGHT_SECONDS: 0.5,
  MAX_FLIGHT_SECONDS: 3.2,
  BASE_FLIGHT_SECONDS: 0.75,
  HEIGHT_SECONDS: 1.05,
  HANGTIME_SECONDS: 0.45,
  MIN_BALL_SPEED: 0.45,
  MAX_BALL_SPEED: 2.4
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

export function calculateTrackmanControlPoints(params: TrackmanParams): BezierControlPoints {
  const { startX, startY, endX, endY, peakHeight, curve, hangtime, videoWidth, videoHeight } = params

  const dx = endX - startX
  const apexHeight = peakHeight * videoHeight
  const apexY = Math.min(startY, endY) - apexHeight
  const apexX = startX + dx * TRACKMAN.APEX_X_RATIO

  const p0 = { x: startX, y: startY }
  const p3 = { x: endX, y: endY }
  const launchFactor = TRACKMAN.LAUNCH_FACTOR_BASE + hangtime * TRACKMAN.LAUNCH_FACTOR_HANGTIME
  const p1 = {
    x: startX + (apexX - startX) * launchFactor + curve * videoWidth * TRACKMAN.CURVE_FACTOR_P1,
    y: startY - apexHeight * launchFactor
  }

  const p2 = {
    x: startX + dx * TRACKMAN.DESCENT_X_RATIO + curve * videoWidth * TRACKMAN.CURVE_FACTOR_P2,
    y: apexY
  }

  return { p0, p1, p2, p3 }
}

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

export function generateBezierPoints(cp: BezierControlPoints, numPoints: number = 60): Point2D[] {
  const points: Point2D[] = []
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints
    points.push(evaluateBezier(t, cp))
  }
  return points
}

export function calculateBezierT(
  frameIndex: number,
  riseFrames: number,
  apexFrames: number,
  fallFrames: number
): number {
  const { T_RISE_END, T_APEX_END } = TRACKMAN
  const apexStartFrame = riseFrames
  const fallStartFrame = riseFrames + apexFrames

  if (frameIndex <= apexStartFrame) {
    const progress = frameIndex / Math.max(1, riseFrames)
    return easeOutCubic(progress) * T_RISE_END
  }

  if (frameIndex <= fallStartFrame) {
    const progress = (frameIndex - apexStartFrame) / Math.max(1, apexFrames)
    return lerp(T_RISE_END, T_APEX_END, smoothstep(progress))
  }

  const progress = (frameIndex - fallStartFrame) / Math.max(1, fallFrames)
  return lerp(T_APEX_END, 1, easeInCubic(progress))
}

export function calculateFlightFrames(
  startY: number,
  apexY: number,
  endY: number,
  ballSpeed: number,
  hangtime: number,
  fps: number = 60
): { riseFrames: number; apexFrames: number; fallFrames: number; totalFrames: number } {
  const rise = Math.max(10, startY - apexY)
  const fall = Math.max(10, endY - apexY)
  const heightRatio = Math.sqrt((rise + fall) / 600)
  const speed = clamp(ballSpeed, TRACKMAN.MIN_BALL_SPEED, TRACKMAN.MAX_BALL_SPEED)
  const hang = clamp(hangtime, 0, 1)

  const flightSeconds = clamp(
    (TRACKMAN.BASE_FLIGHT_SECONDS + heightRatio * TRACKMAN.HEIGHT_SECONDS + hang * TRACKMAN.HANGTIME_SECONDS) / speed,
    TRACKMAN.MIN_FLIGHT_SECONDS,
    TRACKMAN.MAX_FLIGHT_SECONDS
  )

  const totalFrames = Math.max(6, Math.round(flightSeconds * Math.max(1, fps)))
  const apexFrameShare = clamp(0.04 + hang * 0.09, 0.04, 0.13)
  const riseFrameShare = clamp(0.62 + hang * 0.08 - Math.max(0, fall - rise) / 4000, 0.55, 0.72)
  const apexFrames = Math.max(1, Math.round(totalFrames * apexFrameShare))
  const riseFrames = Math.max(2, Math.round(totalFrames * riseFrameShare))
  const fallFrames = Math.max(2, totalFrames - riseFrames - apexFrames)

  return { riseFrames, apexFrames, fallFrames, totalFrames: riseFrames + apexFrames + fallFrames }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * clamp(progress, 0, 1)
}

function smoothstep(progress: number): number {
  const t = clamp(progress, 0, 1)
  return t * t * (3 - 2 * t)
}

function easeOutCubic(progress: number): number {
  const t = 1 - clamp(progress, 0, 1)
  return 1 - t * t * t
}

function easeInCubic(progress: number): number {
  const t = clamp(progress, 0, 1)
  return t * t * t
}
