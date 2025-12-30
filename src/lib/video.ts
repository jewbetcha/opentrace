import type { VideoMetadata } from '../types'

export async function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.setAttribute('webkit-playsinline', 'true')
    video.preload = 'auto'

    const url = URL.createObjectURL(file)
    video.src = url

    video.onloadedmetadata = () => {
      // Force render on iOS by seeking slightly
      video.currentTime = 0.001
      resolve(video)
    }

    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load video'))
    }

    video.load()
  })
}

// Detect video FPS by analyzing frame timestamps
async function detectVideoFps(video: HTMLVideoElement): Promise<number> {
  // Try to use requestVideoFrameCallback if available (Chrome/Edge)
  if ('requestVideoFrameCallback' in video) {
    return new Promise((resolve) => {
      const frameTimestamps: number[] = []
      let frameCount = 0
      const maxFrames = 10

      const captureFrame = (_now: number, metadata: { mediaTime: number }) => {
        frameTimestamps.push(metadata.mediaTime)
        frameCount++

        if (frameCount < maxFrames && video.currentTime < video.duration - 0.5) {
          (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: typeof captureFrame) => void })
            .requestVideoFrameCallback(captureFrame)
        } else {
          video.pause()
          video.currentTime = 0

          // Calculate FPS from timestamps
          if (frameTimestamps.length >= 2) {
            const intervals: number[] = []
            for (let i = 1; i < frameTimestamps.length; i++) {
              intervals.push(frameTimestamps[i] - frameTimestamps[i - 1])
            }
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
            const detectedFps = Math.round(1 / avgInterval)
            // Snap to common framerates
            const commonFps = [24, 25, 30, 48, 50, 60, 120, 240]
            const closest = commonFps.reduce((prev, curr) =>
              Math.abs(curr - detectedFps) < Math.abs(prev - detectedFps) ? curr : prev
            )
            resolve(closest)
          } else {
            resolve(60) // Fallback - assume 60fps for modern phones
          }
        }
      }

      video.currentTime = 0
      video.play().then(() => {
        (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: typeof captureFrame) => void })
          .requestVideoFrameCallback(captureFrame)
      }).catch(() => resolve(60))

      // Timeout fallback
      setTimeout(() => {
        video.pause()
        video.currentTime = 0
        resolve(60)
      }, 2000)
    })
  }

  // Fallback: assume 60fps for modern phone videos
  // Most modern phone videos are recorded at 60fps
  return 60
}

export async function getVideoMetadata(video: HTMLVideoElement): Promise<VideoMetadata> {
  await new Promise<void>((resolve) => {
    if (video.readyState >= 1) {
      resolve()
    } else {
      video.onloadedmetadata = () => resolve()
    }
  })

  // Detect actual FPS
  const fps = await detectVideoFps(video)
  const duration = video.duration
  const frameCount = Math.floor(duration * fps)

  return {
    width: video.videoWidth,
    height: video.videoHeight,
    duration,
    fps,
    frameCount
  }
}

export async function extractFrames(
  video: HTMLVideoElement,
  fps: number = 30,
  onProgress?: (current: number, total: number) => void
): Promise<ImageData[]> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')!

  const frames: ImageData[] = []
  const frameInterval = 1 / fps
  const totalFrames = Math.floor(video.duration * fps)

  for (let i = 0; i < totalFrames; i++) {
    const time = i * frameInterval
    await seekToTime(video, time)

    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    frames.push(imageData)

    onProgress?.(i + 1, totalFrames)
  }

  return frames
}

async function seekToTime(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = time
  })
}

export function getFrameAtTime(
  video: HTMLVideoElement,
  _time: number,
  canvas: HTMLCanvasElement
): ImageData {
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(video, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}
