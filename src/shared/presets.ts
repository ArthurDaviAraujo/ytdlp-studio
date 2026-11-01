import type { ExportSettings } from './types'

export const BASE_EXPORT: ExportSettings = {
  name: 'Personalizado',
  suffix: 'editado',
  width: 0,
  height: 0,
  framing: 'crop',
  position: 50,
  blur: 20,
  barColor: '#000000',
  fps: 0,
  method: 'gpu',
  aiModel: 'rife-v4.6',
  aiUhd: false,
  aiTtaSpatial: false,
  aiTtaTemporal: false,
  aiGpu: -1,
  speed: 1,
  start: '',
  end: '',
  maxDuration: 0,
  encoder: '',
  quality: 20,
  maxBitrate: 0,
  audio: true,
  audioKbps: 192
}

export interface BuiltinPreset {
  id: string
  hint: string
  settings: ExportSettings
}

// Valores recomendados pelas plataformas em 2026; tudo pode ser mudado no formulário
export const BUILTIN_PRESETS: BuiltinPreset[] = [
  { id: 'tiktok', hint: 'Vertical 9:16', settings: { ...BASE_EXPORT, name: 'TikTok', suffix: 'tiktok', width: 1080, height: 1920 } },
  {
    id: 'reels',
    hint: 'Vertical 9:16, até 3 min',
    settings: { ...BASE_EXPORT, name: 'Instagram Reels', suffix: 'reels', width: 1080, height: 1920, maxDuration: 180 }
  },
  {
    id: 'shorts',
    hint: 'Vertical 9:16, até 3 min',
    settings: { ...BASE_EXPORT, name: 'YouTube Shorts', suffix: 'shorts', width: 1080, height: 1920, maxDuration: 180 }
  },
  { id: 'feed', hint: 'Retrato 4:5', settings: { ...BASE_EXPORT, name: 'Instagram feed', suffix: 'feed', width: 1080, height: 1350 } },
  { id: 'square', hint: 'Quadrado 1:1', settings: { ...BASE_EXPORT, name: 'Quadrado', suffix: 'quadrado', width: 1080, height: 1080 } },
  {
    id: 'youtube',
    hint: 'Mantém o tamanho original',
    settings: { ...BASE_EXPORT, name: 'YouTube', suffix: 'youtube', quality: 18, audioKbps: 256 }
  },
  { id: 'custom', hint: 'Do seu jeito', settings: { ...BASE_EXPORT } }
]

export const isV4Model = (model: string) => /rife-v4/i.test(model)

/** "comunidade/rife-v4.26" → { engine: "comunidade", name: "rife-v4.26" } */
export function splitModelId(id: string): { engine: string; name: string } {
  const i = id.indexOf('/')
  return i < 0 ? { engine: '', name: id } : { engine: id.slice(0, i), name: id.slice(i + 1) }
}

// Modelos antigos sem número de versão no nome (README do rife-ncnn-vulkan)
const LEGACY: Record<string, [number, number]> = { rife: [1, 2], 'rife-HD': [1, 5], 'rife-UHD': [1, 6], 'rife-anime': [1, 8] }
const VARIANT_RANK: Record<string, number> = { '': 3, large: 2, heavy: 1, lite: 0 }

/** Chave para ordenar: versão (4.26 > 4.6) e, na mesma versão, normal > large > heavy > lite */
export function modelVersionKey(id: string): [number, number, number] {
  const { name } = splitModelId(id)
  if (LEGACY[name]) return [...LEGACY[name], 3]
  const m = name.match(/v(\d+)(?:\.(\d+))?(?:-(\w+))?/)
  if (!m) return [0, 0, 0]
  return [Number(m[1]), Number(m[2] ?? 0), VARIANT_RANK[m[3] ?? ''] ?? 0]
}

export function compareModels(a: string, b: string): number {
  const ka = modelVersionKey(a)
  const kb = modelVersionKey(b)
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]
}
