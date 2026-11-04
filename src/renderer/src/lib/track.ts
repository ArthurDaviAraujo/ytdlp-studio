import { FaceDetector, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision'

/**
 * Enquadramento inteligente: acha o rosto (ou, sem rosto, a pessoa) em quadros do vídeo com o MediaPipe e devolve a
 * posição do centro ao longo do tempo, já suavizada, em % da largura e da altura do vídeo original.
 */

let detectors: Promise<{ face: FaceDetector; person: ObjectDetector }> | null = null

function load() {
  if (detectors) return detectors
  detectors = (async () => {
    // O .wasm vem da pasta do app; os modelos chegam como bytes pelo processo principal
    const vision = await FilesetResolver.forVisionTasks(new URL('./mediapipe/wasm', location.href).href)
    const [faceModel, personModel] = await Promise.all([window.api.appAsset('blaze_face_short_range.tflite'), window.api.appAsset('efficientdet_lite0.tflite')])
    const face = await FaceDetector.createFromOptions(vision, { baseOptions: { modelAssetBuffer: new Uint8Array(faceModel), delegate: 'CPU' }, runningMode: 'IMAGE', minDetectionConfidence: 0.5 })
    const person = await ObjectDetector.createFromOptions(vision, { baseOptions: { modelAssetBuffer: new Uint8Array(personModel), delegate: 'CPU' }, runningMode: 'IMAGE', scoreThreshold: 0.5, categoryAllowlist: ['person'], maxResults: 5 })
    return { face, person }
  })()
  detectors.catch(() => (detectors = null))
  return detectors
}

const image = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('imagem'))
    img.src = src
  })

export interface TrackResult {
  points: { t: number; x: number; y: number }[]
  /** Em quantos quadros achou alguém */
  found: number
  total: number
}

export async function trackSubject(path: string, start: number, end: number, onProgress: (p: number) => void, canceled: () => boolean): Promise<TrackResult> {
  const len = Math.max(0.5, end - start)
  // Até ~400 quadros: 4 por segundo em vídeo curto, menos em vídeo longo
  const step = Math.max(0.25, len / 400)
  onProgress(1)
  const { face, person } = await load()
  onProgress(4)
  const frames = await window.api.trackFrames(path, start, end, step)
  const raw: ({ t: number; x: number; y: number } | null)[] = []
  for (let i = 0; i < frames.length; i++) {
    if (canceled()) break
    const img = await image(frames[i].data)
    let hit: { x: number; y: number } | null = null
    const faces = face.detect(img).detections
    // O maior rosto é quem importa
    const f = faces.map((d) => d.boundingBox!).filter(Boolean).sort((a, b) => b.width * b.height - a.width * a.height)[0]
    if (f) hit = { x: ((f.originX + f.width / 2) / img.width) * 100, y: ((f.originY + f.height / 2) / img.height) * 100 }
    else {
      const p = person.detect(img).detections.map((d) => d.boundingBox!).filter(Boolean).sort((a, b) => b.width * b.height - a.width * a.height)[0]
      // Pessoa sem rosto visível: mira na altura da cabeça
      if (p) hit = { x: ((p.originX + p.width / 2) / img.width) * 100, y: ((p.originY + p.height * 0.25) / img.height) * 100 }
    }
    raw.push(hit ? { t: frames[i].t, ...hit } : null)
    onProgress(4 + ((i + 1) / frames.length) * 92)
  }
  const found = raw.filter(Boolean).length
  // Sem ninguém no quadro: fica onde estava (ou no centro, se ainda não achou ninguém)
  let last = raw.find(Boolean) ?? { t: start, x: 50, y: 50 }
  const filled = raw.map((r, i) => (r ? (last = r) : { t: frames[i].t, x: last.x, y: last.y }))
  // Suavização: média de ~1,2 s, para o corte andar como uma câmera e não tremer a cada quadro
  const half = Math.max(1, Math.round(0.6 / step))
  const points = filled.map((p, i) => {
    const win = filled.slice(Math.max(0, i - half), i + half + 1)
    return { t: p.t, x: win.reduce((s, q) => s + q.x, 0) / win.length, y: win.reduce((s, q) => s + q.y, 0) / win.length }
  })
  onProgress(100)
  return { points, found, total: frames.length }
}

export { trackAt } from '../../../shared/track'
