import * as ort from 'onnxruntime-web/wasm'
import type { BoundingBox } from '../types'

let session: ort.InferenceSession | null = null
const MODEL_INPUT_SIZE = 640

export async function loadModel(modelPath: string): Promise<void> {
  // Configure WASM backend - must match installed version (1.23.2)
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/'
  ort.env.wasm.numThreads = 1

  session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['wasm']
  })
}

export function isModelLoaded(): boolean {
  return session !== null
}

export async function detectBalls(
  imageData: ImageData,
  confidenceThreshold: number = 0.25
): Promise<BoundingBox[]> {
  if (!session) {
    throw new Error('Model not loaded')
  }

  const { tensor, scale, padX, padY } = preprocessImage(imageData)

  const feeds = { images: tensor }
  const results = await session.run(feeds)

  const output = results[Object.keys(results)[0]]
  const boxes = postprocessOutput(
    output.data as Float32Array,
    output.dims,
    scale,
    padX,
    padY,
    imageData.width,
    imageData.height,
    confidenceThreshold
  )

  return boxes
}

function preprocessImage(imageData: ImageData): {
  tensor: ort.Tensor
  scale: number
  padX: number
  padY: number
} {
  const { width, height } = imageData

  const scale = Math.min(MODEL_INPUT_SIZE / width, MODEL_INPUT_SIZE / height)
  const newWidth = Math.round(width * scale)
  const newHeight = Math.round(height * scale)
  const padX = Math.floor((MODEL_INPUT_SIZE - newWidth) / 2)
  const padY = Math.floor((MODEL_INPUT_SIZE - newHeight) / 2)

  const canvas = document.createElement('canvas')
  canvas.width = MODEL_INPUT_SIZE
  canvas.height = MODEL_INPUT_SIZE
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)

  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = width
  tempCanvas.height = height
  const tempCtx = tempCanvas.getContext('2d')!
  tempCtx.putImageData(imageData, 0, 0)

  ctx.drawImage(tempCanvas, padX, padY, newWidth, newHeight)

  const resizedData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)
  const float32Data = new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE)

  for (let i = 0; i < MODEL_INPUT_SIZE * MODEL_INPUT_SIZE; i++) {
    float32Data[i] = resizedData.data[i * 4] / 255
    float32Data[MODEL_INPUT_SIZE * MODEL_INPUT_SIZE + i] = resizedData.data[i * 4 + 1] / 255
    float32Data[2 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE + i] = resizedData.data[i * 4 + 2] / 255
  }

  const tensor = new ort.Tensor('float32', float32Data, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])

  return { tensor, scale, padX, padY }
}

function postprocessOutput(
  data: Float32Array,
  dims: readonly number[],
  scale: number,
  padX: number,
  padY: number,
  origWidth: number,
  origHeight: number,
  confidenceThreshold: number
): BoundingBox[] {
  const numDetections = dims[2]
  const boxes: BoundingBox[] = []

  for (let i = 0; i < numDetections; i++) {
    const cx = data[i]
    const cy = data[numDetections + i]
    const w = data[2 * numDetections + i]
    const h = data[3 * numDetections + i]
    const confidence = data[4 * numDetections + i]

    if (confidence < confidenceThreshold) continue

    const x1 = (cx - w / 2 - padX) / scale
    const y1 = (cy - h / 2 - padY) / scale
    const boxWidth = w / scale
    const boxHeight = h / scale

    if (x1 < 0 || y1 < 0 || x1 + boxWidth > origWidth || y1 + boxHeight > origHeight) {
      continue
    }

    boxes.push({
      x: Math.max(0, x1),
      y: Math.max(0, y1),
      width: Math.min(boxWidth, origWidth - x1),
      height: Math.min(boxHeight, origHeight - y1),
      confidence
    })
  }

  return nms(boxes, 0.5)
}

function nms(boxes: BoundingBox[], iouThreshold: number): BoundingBox[] {
  if (boxes.length === 0) return []

  boxes.sort((a, b) => b.confidence - a.confidence)

  const kept: BoundingBox[] = []
  const suppressed = new Set<number>()

  for (let i = 0; i < boxes.length; i++) {
    if (suppressed.has(i)) continue

    kept.push(boxes[i])

    for (let j = i + 1; j < boxes.length; j++) {
      if (suppressed.has(j)) continue

      if (iou(boxes[i], boxes[j]) > iouThreshold) {
        suppressed.add(j)
      }
    }
  }

  return kept
}

function iou(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)

  if (x2 <= x1 || y2 <= y1) return 0

  const intersection = (x2 - x1) * (y2 - y1)
  const areaA = a.width * a.height
  const areaB = b.width * b.height

  return intersection / (areaA + areaB - intersection)
}
