import type { VideoMetadata } from '../types'

export async function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true

    const url = URL.createObjectURL(file)
    video.src = url

    video.onloadedmetadata = () => {
      resolve(video)
    }

    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load video'))
    }
  })
}

export async function getVideoMetadata(video: HTMLVideoElement): Promise<VideoMetadata> {
  await new Promise<void>((resolve) => {
    if (video.readyState >= 1) {
      resolve()
    } else {
      video.onloadedmetadata = () => resolve()
    }
  })

  const fps = 30
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
