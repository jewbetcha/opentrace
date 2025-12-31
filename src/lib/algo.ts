// Types for 3D Coordinates
interface Vector3 {
  x: number; // Left/Right (Side)
  y: number; // Up/Down (Height)
  z: number; // Forward (Distance)
}

interface LaunchData {
  ballSpeed: number; // meters per second
  launchAngle: number; // degrees
  sideAngle: number; // degrees (azimuth)
  backSpin: number; // rpm
  sideSpin: number; // rpm (negative = left/hook, positive = right/slice)
}

class GolfTrajectoryBezier {
  /**
   * Generates the 4 control points for a Cubic Bezier Curve.
   * @param data The launch parameters of the shot
   * @returns [P0, P1, P2, P3] as Vector3 objects
   */
  public generateControlPoints(
    data: LaunchData
  ): [Vector3, Vector3, Vector3, Vector3] {
    // 1. Calculate Approximated Landing Position (Physics estimates)
    // In a real system, you might run a discrete physics simulation here.
    // We will use simplified heuristics for the "Trackman Look".

    const gravity = 9.81;
    const radAngle = this.degToRad(data.launchAngle);
    const radAzimuth = this.degToRad(data.sideAngle);

    // Estimate Total Carry Distance (Simple Projectile motion + lift heuristic)
    // Real golf drag coefficient is complex; this is a visual approximation factor.
    const velocity = data.ballSpeed;
    const approxCarry =
      (Math.pow(velocity, 2) * Math.sin(2 * radAngle)) / gravity;

    // Adjust carry for spin (Lift adds distance, excessive spin balloons it)
    const liftFactor = 1 + data.backSpin / 10000;
    const finalDistance = approxCarry * liftFactor;

    // Calculate Curve (Sidespin displacement)
    // A simplified Magnus effect: more side spin = more lateral movement
    const curveFactor = 0.0002; // Tunable constant for visual scale
    const maxSideDeviation = data.sideSpin * finalDistance * curveFactor;

    // --- DEFINE POINTS ---

    // P0: Start (The Tee)
    const p0: Vector3 = { x: 0, y: 0, z: 0 };

    // P3: End (The Landing Spot)
    // Z is forward distance, X is side deviation
    const p3: Vector3 = {
      x: Math.sin(radAzimuth) * finalDistance + maxSideDeviation,
      y: 0,
      z: Math.cos(radAzimuth) * finalDistance,
    };

    // P1: Launch Control Point
    // Extrapolate out from P0 along the launch angle.
    // Generally, placing P1 at 30-40% of the distance gives a good ascent.
    const handleLength1 = finalDistance * 0.33;
    const p1: Vector3 = {
      x: Math.sin(radAzimuth) * handleLength1,
      y: Math.tan(radAngle) * handleLength1, // Rise based on launch angle
      z: Math.cos(radAzimuth) * handleLength1,
    };

    // P2: Apex/Descent Control Point
    // To get the "Golf" look (steep descent), P2 is usually high and pushed forward.
    // We place it at ~75% of the distance, at a height that simulates the apex.
    const apexHeight =
      (Math.pow(velocity * Math.sin(radAngle), 2) / (2 * gravity)) * liftFactor;

    // The "Steep Drop" trick:
    // If P2 is close to P3 in X/Z but high in Y, the ball drops straight down at the end.
    const handleLength2 = finalDistance * 0.7;
    const p2: Vector3 = {
      x: p3.x * 0.8, // Bias slightly towards the landing X
      y: apexHeight * 1.8, // Artificial height to pull the curve up for "hang time"
      z: handleLength2,
    };

    return [p0, p1, p2, p3];
  }

  /**
   * Utility to sample points along the curve for drawing lines
   * @param t value from 0 to 1
   */
  public getPointOnCurve(
    t: number,
    points: [Vector3, Vector3, Vector3, Vector3]
  ): Vector3 {
    const [p0, p1, p2, p3] = points;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    // Cubic Bezier Formula: B(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)*t^2*P2 + t^3*P3
    return {
      x:
        mt3 * p0.x +
        3 * mt2 * t * p1.x +
        3 * mt * t * t * p2.x +
        t * t * t * p3.x,
      y:
        mt3 * p0.y +
        3 * mt2 * t * p1.y +
        3 * mt * t * t * p2.y +
        t * t * t * p3.y,
      z:
        mt3 * p0.z +
        3 * mt2 * t * p1.z +
        3 * mt * t * t * p2.z +
        t * t * t * p3.z,
    };
  }

  private degToRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
