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
  APEX_X_RATIO: 0.72,
  LAUNCH_FACTOR_BASE: 0.34,
  LAUNCH_FACTOR_HANGTIME: 0.3,
  DESCENT_X_RATIO: 0.93,
  CURVE_FACTOR_P1: 0.025,
  CURVE_FACTOR_P2: 0.055,

  MIN_FLIGHT_SECONDS: 0.5,
  MAX_FLIGHT_SECONDS: 2.8,
  BASE_FLIGHT_SECONDS: 0.55,
  HEIGHT_SECONDS: 0.9,
  HANGTIME_SECONDS: 0.35,
  MIN_BALL_SPEED: 0.45,
  MAX_BALL_SPEED: 2.4,
  SAMPLES_PER_FRAME: 3,
  VIDEO_EDGE_MARGIN: 0.035
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
  const apexHeight = getVisibleApexHeight(startY, endY, peakHeight, videoHeight)
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
  const totalFrames = Math.max(1, riseFrames + apexFrames + fallFrames)
  const progress = clamp(frameIndex / totalFrames, 0, 1)
  return dragProgress(progress)
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

  const totalFrames = Math.max(8, Math.round(flightSeconds * Math.max(1, fps)))
  const apexFrameShare = clamp(0.03 + hang * 0.06, 0.03, 0.09)
  const riseFrameShare = clamp(0.58 + hang * 0.08 - Math.max(0, fall - rise) / 5000, 0.54, 0.68)
  const apexFrames = Math.max(1, Math.round(totalFrames * apexFrameShare))
  const riseFrames = Math.max(2, Math.round(totalFrames * riseFrameShare))
  const fallFrames = Math.max(2, totalFrames - riseFrames - apexFrames)

  return { riseFrames, apexFrames, fallFrames, totalFrames: riseFrames + apexFrames + fallFrames }
}

export interface GolfFlightParams extends TrackmanParams {
  ballSpeed: number
  impactFrame: number
  totalFrames: number
  fps: number
}

export interface FlightPoint extends Point2D {
  frameIndex: number
}

export function generateGolfFlightPoints(params: GolfFlightParams): FlightPoint[] {
  const {
    startX,
    startY,
    endX,
    endY,
    peakHeight,
    curve,
    ballSpeed,
    hangtime,
    impactFrame,
    totalFrames,
    fps,
    videoWidth,
    videoHeight
  } = params

  const apexHeight = getVisibleApexHeight(startY, endY, peakHeight, videoHeight)
  const apexY = Math.min(startY, endY) - apexHeight
  const timing = calculateFlightFrames(startY, apexY, endY, ballSpeed, hangtime, fps)
  const flightFrames = Math.min(timing.totalFrames, totalFrames - impactFrame - 1)
  const sampleCount = Math.max(1, Math.round(flightFrames * TRACKMAN.SAMPLES_PER_FRAME))
  const points: FlightPoint[] = []
  const curveAmplitude = curve * videoWidth * 0.1
  const apexProgress = clamp(TRACKMAN.APEX_X_RATIO + hangtime * 0.06, 0.66, 0.8)

  for (let i = 0; i <= sampleCount; i++) {
    const frameOffset = i / TRACKMAN.SAMPLES_PER_FRAME
    const frameIndex = impactFrame + frameOffset
    if (frameIndex >= totalFrames) break

    const timeProgress = i / sampleCount
    const carryProgress = dragProgress(timeProgress)
    const lift = asymmetricArc(carryProgress, apexProgress)
    const curveOffset = curveAmplitude * Math.sin(Math.PI * carryProgress)

    points.push({
      frameIndex,
      x: clamp(lerp(startX, endX, carryProgress) + curveOffset, 0, videoWidth),
      y: clamp(lerp(startY, endY, carryProgress) - apexHeight * lift, 0, videoHeight)
    })
  }

  return points
}

export function getVisibleApexHeight(startY: number, endY: number, peakHeight: number, videoHeight: number): number {
  const margin = videoHeight * TRACKMAN.VIDEO_EDGE_MARGIN
  const maxApexHeight = Math.max(12, Math.min(startY, endY) - margin)
  return clamp(peakHeight * videoHeight, 8, maxApexHeight)
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

function dragProgress(progress: number): number {
  const t = clamp(progress, 0, 1)
  const drag = 1.05
  return (1 - Math.exp(-drag * t)) / (1 - Math.exp(-drag))
}

function asymmetricArc(progress: number, apexProgress: number): number {
  const t = clamp(progress, 0, 1)

  if (t <= apexProgress) {
    return smoothstep(t / apexProgress)
  }

  const fallProgress = (t - apexProgress) / Math.max(0.01, 1 - apexProgress)
  return 1 - fallProgress * fallProgress * (3 - 2 * fallProgress)
}
