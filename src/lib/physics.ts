export interface LaunchConditions {
  speed: number; // Ball speed in mph
  launchAngle: number; // Vertical launch angle in degrees
  azimuth: number; // Horizontal start angle in degrees
  backSpin: number; // Backspin in rpm
  sideSpin: number; // Sidespin in rpm (positive = fade/slice, negative = draw/hook)
}

export interface Environment {
  windSpeed: number; // mph
  windDirection: number; // degrees (0 = North/Tailwind, 90 = East, etc)
  airDensity: number; // kg/m^3 (Sea level = 1.225)
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export class GolfPhysicsSimulator {
  // Physical Constants
  private readonly mass = 0.0459; // Standard golf ball mass (kg)
  private readonly radius = 0.02135; // Standard radius (m)
  private readonly area = Math.PI * Math.pow(this.radius, 2); // Cross-sectional area
  private readonly gravity = 9.81; // m/s^2

  /**
   * Simulates the full flight path until the ball hits the ground.
   * @param launch Initial launch conditions
   * @param env Environmental conditions (wind, air density)
   * @param timeStep Delta time for simulation (smaller = more accurate, e.g., 0.01s)
   */
  public simulateShot(
    launch: LaunchConditions,
    env: Environment,
    timeStep: number = 0.01
  ): Vector3[] {
    const trajectory: Vector3[] = [];

    // 1. Convert Units to Metric (SI)
    let velocity = this.getInitialVelocity(launch);
    let spinRate =
      Math.sqrt(launch.backSpin ** 2 + launch.sideSpin ** 2) * (Math.PI / 30); // Rad/s

    // Spin Axis Vector (Normalized) - simplified approximation
    // Pure backspin rotates around X-axis. Sidespin tilts this axis.
    let spinAxis = this.computeSpinAxis(
      launch.backSpin,
      launch.sideSpin,
      velocity
    );

    let position = { x: 0, y: 0, z: 0 }; // Start at tee
    let time = 0;

    // 2. Simulation Loop
    while (position.y >= 0 && time < 20) {
      // Safety break at 20s
      trajectory.push({ ...position });

      // Calculate Forces
      const forces = this.calculateForces(velocity, spinRate, spinAxis, env);

      // Acceleration = Force / Mass (Newton's 2nd Law)
      const acceleration = {
        x: forces.x / this.mass,
        y: forces.y / this.mass,
        z: forces.z / this.mass,
      };

      // Update Velocity (v = v0 + a*t)
      velocity.x += acceleration.x * timeStep;
      velocity.y += acceleration.y * timeStep;
      velocity.z += acceleration.z * timeStep;

      // Update Position (p = p0 + v*t)
      position.x += velocity.x * timeStep;
      position.y += velocity.y * timeStep;
      position.z += velocity.z * timeStep;

      // Update Spin (Spin Decay)
      // Spin decays due to air friction. Approx 1% decay per second is a common heuristic.
      spinRate *= 1 - 0.01 * timeStep;

      time += timeStep;
    }

    return trajectory;
  }

  /**
   * Calculates the net force acting on the ball at a specific instant.
   */
  private calculateForces(
    vel: Vector3,
    spinRate: number,
    spinAxis: Vector3,
    env: Environment
  ): Vector3 {
    // Relative Velocity (Ball Velocity - Wind Velocity)
    // For simplicity, assuming wind is 0 for this snippet, but you'd subtract wind vector here.
    const vMag = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);

    // 1. Gravity Force (Downwards)
    const Fg = { x: 0, y: -this.mass * this.gravity, z: 0 };

    // 2. Drag Force (Opposite to velocity)
    // Fd = 0.5 * rho * Area * Cd * v^2
    const Cd = this.getDragCoefficient(vMag, spinRate);
    const dragMagnitude = 0.5 * env.airDensity * this.area * Cd * vMag ** 2;
    const Fd = {
      x: -dragMagnitude * (vel.x / vMag),
      y: -dragMagnitude * (vel.y / vMag),
      z: -dragMagnitude * (vel.z / vMag),
    };

    // 3. Magnus Force (Lift & Curve)
    // Fm = 0.5 * rho * Area * Cl * v^2 * (SpinAxis x Velocity direction)
    // Direction is cross product of Spin Axis and Velocity
    const Cl = this.getLiftCoefficient(vMag, spinRate);
    const liftMagnitude = 0.5 * env.airDensity * this.area * Cl * vMag ** 2;

    // Cross product: SpinAxis x VelocityUnitVector
    const crossProd = this.crossProduct(spinAxis, {
      x: vel.x / vMag,
      y: vel.y / vMag,
      z: vel.z / vMag,
    });
    const Fm = {
      x: liftMagnitude * crossProd.x,
      y: liftMagnitude * crossProd.y,
      z: liftMagnitude * crossProd.z,
    };

    // Net Force
    return {
      x: Fg.x + Fd.x + Fm.x,
      y: Fg.y + Fd.y + Fm.y,
      z: Fg.z + Fd.z + Fm.z,
    };
  }

  /**
   * The "Secret Sauce": Aerodynamic Coefficients.
   * Real models use lookup tables. These are standard scientific approximations.
   */
  private getDragCoefficient(velocity: number, _spinRate: number): number {
    // Golf balls have complex aerodynamics. High speed = lower Cd (turbulent wake).
    // Approx: Cd drops as Reynolds number increases.
    // Ideally: return 0.24 roughly, but accurate models vary Cd with Spin Ratio.
    return 0.22 + 0.01 * (100 / (velocity + 1)); // Simplified inverse relationship
  }

  private getLiftCoefficient(velocity: number, spinRate: number): number {
    // Lift relies on "Spin Ratio" (surface speed / ball speed)
    // Cl ~ SpinRatio^0.4 or similar.
    const spinRatio = (spinRate * this.radius) / velocity;
    // Common approximation for golf balls:
    return Math.min(0.35, 0.16 * spinRatio + 0.05);
  }

  // --- Helpers ---

  private getInitialVelocity(data: LaunchConditions): Vector3 {
    const mphToMps = 0.44704;
    const speed = data.speed * mphToMps;
    const radLaunch = data.launchAngle * (Math.PI / 180);
    const radAzimuth = data.azimuth * (Math.PI / 180);

    return {
      x: speed * Math.cos(radLaunch) * Math.sin(radAzimuth), // Side
      y: speed * Math.sin(radLaunch), // Up
      z: speed * Math.cos(radLaunch) * Math.cos(radAzimuth), // Forward
    };
  }

  private computeSpinAxis(
    backSpin: number,
    sideSpin: number,
    _vel: Vector3
  ): Vector3 {
    // This defines the axis the ball rotates around.
    // Pure backspin = horizontal axis. Sidespin tilts it.
    // This is a complex vector rotation, simplified here for "tilt":
    const tiltAngle = Math.atan2(sideSpin, backSpin); // Angle of axis tilt

    // Axis is roughly perpendicular to velocity, tilted by side spin
    return {
      x: Math.sin(tiltAngle),
      y: 0,
      z: Math.cos(tiltAngle), // Simplified: assumes Z is primary perpendicular axis
    };
  }

  private crossProduct(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }
}

// ============================================
// HELPER: Generate trajectory for user inputs
// ============================================

export interface TrajectoryParams {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  peakHeight: number;      // 0-1, how high the ball goes (affects launch angle)
  curve: number;           // -1 to 1, draw/fade (affects sidespin)
  ballSpeed: number;       // 0.5-10, animation speed multiplier
  hangtime: number;        // 0-1, affects backspin (more spin = more hang)
}

export interface Point2D {
  x: number;
  y: number;
  t: number;  // Normalized time 0-1
}

/**
 * Generates a physics-based trajectory that fits between user's start and end points.
 *
 * Strategy:
 * 1. Derive launch parameters from user sliders
 * 2. Run physics simulation to get realistic trajectory shape
 * 3. Normalize and scale the trajectory to fit user's points
 */
export function generatePhysicsTrajectory(params: TrajectoryParams): Point2D[] {
  const { startX, startY, endX, endY, peakHeight, curve, hangtime } = params;

  // Calculate the horizontal distance and direction
  const dx = endX - startX;
  const horizontalDist = Math.abs(dx);

  // If points are too close, return simple line
  if (horizontalDist < 10) {
    return [
      { x: startX, y: startY, t: 0 },
      { x: endX, y: endY, t: 1 }
    ];
  }

  // === DERIVE LAUNCH PARAMETERS FROM USER INPUT ===

  // Ball speed: Derived from horizontal distance (longer = faster)
  // Typical driver: 160-180 mph, iron: 100-140 mph
  const baseSpeed = 120 + (horizontalDist / 10);  // Scale with distance
  const speed = Math.min(180, Math.max(80, baseSpeed));

  // Launch angle: Derived from peakHeight slider
  // Driver: 10-15°, Iron: 15-25°, Wedge: 25-45°
  const launchAngle = 10 + peakHeight * 35;  // 10° to 45°

  // Backspin: Derived from hangtime slider
  // Driver: 2000-3000 rpm, Iron: 4000-8000 rpm, Wedge: 8000-12000 rpm
  const backSpin = 2500 + hangtime * 7500;  // 2500 to 10000 rpm

  // Sidespin: Derived from curve slider
  // Draw/Hook: negative, Fade/Slice: positive
  // Typical range: -2000 to +2000 rpm
  const sideSpin = curve * 2000;

  // Azimuth: Start angle to compensate for curve
  // Ball curves opposite to start direction
  const azimuth = -curve * 5;  // -5° to +5°

  // Run physics simulation
  const simulator = new GolfPhysicsSimulator();
  const trajectory3D = simulator.simulateShot(
    { speed, launchAngle, azimuth, backSpin, sideSpin },
    { windSpeed: 0, windDirection: 0, airDensity: 1.225 },
    0.005  // High precision time step
  );

  if (trajectory3D.length < 2) {
    return [
      { x: startX, y: startY, t: 0 },
      { x: endX, y: endY, t: 1 }
    ];
  }

  // === NORMALIZE AND SCALE TRAJECTORY ===

  // Find bounds of simulated trajectory
  // In simulation: z = forward, y = up, x = side
  const simStart = trajectory3D[0];
  const simEnd = trajectory3D[trajectory3D.length - 1];

  // Total forward distance and max height in simulation
  const simForwardDist = simEnd.z - simStart.z;
  const simMaxHeight = Math.max(...trajectory3D.map(p => p.y));

  // Scale factors to fit user's points
  const scaleZ = horizontalDist / Math.max(1, simForwardDist);  // Forward to horizontal
  const userPeakHeight = peakHeight * Math.max(startY, endY) * 0.8;  // Desired peak height in screen coords
  const scaleY = userPeakHeight / Math.max(1, simMaxHeight);  // Up to screen Y (inverted)

  // Convert 3D trajectory to 2D screen coordinates
  const trajectory2D: Point2D[] = trajectory3D.map((p3d, i) => {
    // Progress along trajectory (normalized time)
    const t = i / (trajectory3D.length - 1);

    // Map simulation coords to screen coords
    // z (forward) -> x (horizontal)
    // y (up) -> y (inverted, up is negative)
    // x (side) -> additional x offset for curve

    const forwardProgress = (p3d.z - simStart.z) / Math.max(1, simForwardDist);

    // Base X position from forward progress
    let x = startX + dx * forwardProgress;

    // Add side curve (scaled appropriately)
    // The physics already includes the curve, we just need to scale it
    x += (p3d.x - simStart.x * forwardProgress) * scaleZ * 0.5;

    // Y position: subtract height (screen coords are inverted)
    const y = startY - (p3d.y * scaleY);

    return { x, y, t };
  });

  // === ENSURE END POINT MATCHES USER'S END POINT ===
  // The physics simulation lands based on physics, but we need to match user's end point
  // So we apply a correction that increases toward the end

  const lastPoint = trajectory2D[trajectory2D.length - 1];
  const endErrorX = endX - lastPoint.x;
  const endErrorY = endY - lastPoint.y;

  // Apply graduated correction (more correction toward end)
  const correctedTrajectory = trajectory2D.map((p, i) => {
    const t = i / (trajectory2D.length - 1);
    // Use ease-in curve for correction (t^2) so it's subtle at start, strong at end
    const correctionFactor = t * t;

    return {
      x: p.x + endErrorX * correctionFactor,
      y: p.y + endErrorY * correctionFactor,
      t: p.t
    };
  });

  return correctedTrajectory;
}
