import type { TrackPoint, TracerStyle } from '../types'

export function drawTracer(
  ctx: CanvasRenderingContext2D,
  points: TrackPoint[],
  currentFrame: number,
  style: TracerStyle = {
    startColor: '#FFD700',
    endColor: '#FF4500',
    lineWidth: 4,
    glowIntensity: 10
  }
): void {
  const visiblePoints = points.filter(p => p.frameIndex <= currentFrame)

  if (visiblePoints.length < 2) return

  ctx.save()

  if (style.glowIntensity > 0) {
    ctx.shadowColor = style.startColor
    ctx.shadowBlur = style.glowIntensity
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (let i = 1; i < visiblePoints.length; i++) {
    const p1 = visiblePoints[i - 1]
    const p2 = visiblePoints[i]
    const t = i / (visiblePoints.length - 1)

    const color = interpolateColor(style.startColor, style.endColor, t)
    const width = style.lineWidth * (1 - t * 0.5)

    ctx.strokeStyle = color
    ctx.lineWidth = width

    ctx.setLineDash(p2.isEstimated ? [8, 4] : [])

    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
  }

  ctx.restore()
}

function interpolateColor(color1: string, color2: string, t: number): string {
  const c1 = hexToRgb(color1)
  const c2 = hexToRgb(color2)

  const r = Math.round(c1.r + (c2.r - c1.r) * t)
  const g = Math.round(c1.g + (c2.g - c1.g) * t)
  const b = Math.round(c1.b + (c2.b - c1.b) * t)

  return `rgb(${r}, ${g}, ${b})`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) {
    return { r: 255, g: 255, b: 255 }
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  }
}

