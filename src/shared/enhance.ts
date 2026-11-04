import type { EnhanceSettings, ExportSettings, MediaInfo } from './types'

/** Tudo desligado: o vídeo sai como entrou */
export const NO_ENHANCE: EnhanceSettings = {
  upscaler: 'none',
  esrganModel: 'realesr-animevideov3',
  cuganModel: 'se',
  upScale: 0,
  cuganNoise: -1,
  upTta: false,
  upTile: 0,
  upBlend: 100,
  deinterlace: false,
  denoise: 0,
  denoiseMethod: 'fast',
  deblock: 0,
  deband: false,
  sharpen: 0,
  sharpenMethod: 'cas',
  brightness: 0,
  contrast: 0,
  saturation: 0,
  vibrance: 0,
  gamma: 0,
  warmth: 0,
  autoLight: false,
  stabilize: 'off',
  deflicker: false,
  grain: 0,
  audioDenoise: 0,
  audioCut: false,
  audioLevel: 'off'
}

/** Configurações antigas (e predefinições salvas antes da 1.4) não têm `enhance` */
export const enhanceOf = (s: Pick<ExportSettings, 'enhance'>): EnhanceSettings => ({ ...NO_ENHANCE, ...(s.enhance ?? {}) })

/** Escalas que cada modelo aceita */
export function upScales(e: EnhanceSettings): number[] {
  if (e.upscaler === 'esrgan') return e.esrganModel === 'realesr-animevideov3' ? [2, 3, 4] : [4]
  if (e.upscaler === 'cugan') return e.cuganModel === 'nose' ? [2] : e.cuganModel === 'pro' ? [2, 3] : [2, 3, 4]
  return []
}

/** Níveis de redução de ruído do Real-CUGAN que existem para o modelo e a escala (-1 = conservador, 0 = sem) */
export function cuganNoises(model: EnhanceSettings['cuganModel'], scale: number): number[] {
  if (model === 'nose') return [0]
  if (model === 'se' && scale === 2) return [-1, 0, 1, 2, 3]
  return [-1, 0, 3]
}

/** O nível pedido, ou o mais próximo que existe */
export function nearestNoise(model: EnhanceSettings['cuganModel'], scale: number, want: number): number {
  const list = cuganNoises(model, scale)
  return list.reduce((best, n) => (Math.abs(n - want) < Math.abs(best - want) ? n : best), list[0])
}

/**
 * Quanto ampliar com a IA. Automático: o menor fator que deixa a imagem pelo menos do tamanho final;
 * se o vídeo já é maior que o destino, o menor fator (a IA ainda limpa e o resultado é reduzido depois).
 */
export function chooseScale(e: EnhanceSettings, need: number): number {
  const list = upScales(e)
  if (!list.length) return 1
  if (e.upScale && list.includes(e.upScale)) return e.upScale
  return list.find((k) => k >= need - 0.01) ?? list[list.length - 1]
}

/** Quanto a imagem do vídeo precisa crescer para encher o tamanho final (corte usa a área recortada) */
export function neededScale(info: Pick<MediaInfo, 'width' | 'height'>, s: ExportSettings): number {
  const W = s.width || info.width
  const H = s.height || info.height
  const srcAR = info.width / info.height
  const dstAR = W / H
  if (s.framing === 'crop' || Math.abs(srcAR - dstAR) < 0.01) {
    const zoom = s.framing === 'crop' ? Math.max(1, s.zoom || 1) : 1
    const cw = (srcAR > dstAR ? info.height * dstAR : info.width) / zoom
    return W / cw
  }
  return Math.min(W / info.width, H / info.height)
}

/** Maior lado do vídeo quando a IA amplia com "Manter o original" (4K) */
export const AI_KEEP_MAX = 3840

/**
 * Com "Manter o original" (largura e altura 0) e a IA ligada, o tamanho final é o original × fator,
 * limitado a 4K no lado maior (um vídeo 4K ampliado 2x daria 8K, pesado demais para qualquer rede).
 */
export function withAiSize(s: ExportSettings, src: Pick<MediaInfo, 'width' | 'height'>): ExportSettings {
  const e = enhanceOf(s)
  if (e.upscaler === 'none' || s.width || s.height) return s
  const k = chooseScale(e, 1)
  const W = src.width * k
  const H = src.height * k
  const f = Math.min(1, AI_KEEP_MAX / Math.max(W, H))
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  return { ...s, width: even(W * f), height: even(H * f) }
}

const r2 = (n: number) => Math.round(n * 1000) / 1000

/** Limpeza: roda no tamanho original, antes da IA e antes de mudar o tamanho */
export function cleanFilters(e: EnhanceSettings, vidstab?: string): string[] {
  const f: string[] = []
  if (e.deinterlace) f.push('bwdif=mode=send_frame:deint=all')
  if (e.stabilize === 'light') f.push('deshake=rx=32:ry=32:edge=mirror')
  // Estabilização forte: o vidstab (2 passadas); a 2ª entra aqui, logo depois de desentrelaçar
  if (e.stabilize === 'strong' && vidstab) f.push(vidstab)
  if (e.deflicker) f.push('deflicker=size=5:mode=pm')
  if (e.deblock > 0) {
    const k = e.deblock / 5
    f.push(`deblock=filter=strong:block=8:alpha=${r2(0.098 * k)}:beta=${r2(0.05 * k)}:gamma=${r2(0.05 * k)}:delta=${r2(0.05 * k)}`)
  }
  if (e.denoise > 0) {
    const d = e.denoise
    if (e.denoiseMethod === 'quality') f.push(`nlmeans=s=${r2(1 + d * 0.8)}:p=5:r=11`)
    else f.push(`hqdn3d=${r2(d * 0.8)}:${r2(d * 0.6)}:${r2(d * 1.2)}:${r2(d * 0.9)}`)
  }
  if (e.deband) f.push('deband=1thr=0.015:2thr=0.015:3thr=0.015:range=16:blur=1')
  return f
}

/** Cor, luz, nitidez e granulado: rodam no tamanho final */
export function lookFilters(e: EnhanceSettings): string[] {
  const f: string[] = []
  if (e.autoLight) f.push('normalize=smoothing=24:independence=0.3:strength=0.6')
  if (e.brightness || e.contrast || e.saturation || e.gamma) {
    const parts = []
    if (e.brightness) parts.push(`brightness=${r2(e.brightness * 0.0025)}`)
    if (e.contrast) parts.push(`contrast=${r2(1 + e.contrast / 200)}`)
    if (e.saturation) parts.push(`saturation=${r2(1 + e.saturation / 100)}`)
    if (e.gamma) parts.push(`gamma=${r2(Math.pow(2, e.gamma / 100))}`)
    f.push(`eq=${parts.join(':')}`)
  }
  if (e.vibrance) f.push(`vibrance=intensity=${r2(e.vibrance / 100)}`)
  // Mais quente = temperatura de cor menor (mais alaranjada)
  if (e.warmth) f.push(`colortemperature=temperature=${Math.round(6500 - e.warmth * 35)}:pl=0.5`)
  if (e.sharpen > 0) {
    if (e.sharpenMethod === 'unsharp') f.push(`unsharp=5:5:${r2(e.sharpen * 0.15)}:5:5:0`)
    else f.push(`cas=strength=${r2(e.sharpen / 10)}`)
  }
  if (e.grain > 0) f.push(`noise=c0s=${Math.round(e.grain * 2)}:c0f=t+u`)
  return f
}

/** Filtros de som, na ordem: corta o ronco, tira o chiado e acerta o volume */
export function audioFilters(e: EnhanceSettings): string[] {
  const f: string[] = []
  if (e.audioCut) f.push('highpass=f=80')
  if (e.audioDenoise > 0) f.push(`afftdn=nr=${r2(6 + e.audioDenoise * 2.4)}:nf=-40:tn=1`)
  if (e.audioLevel === 'even') f.push('dynaudnorm=f=250:g=15:p=0.9')
  // O loudnorm devolve o som em 192 kHz; o aresample volta para 48 kHz
  if (e.audioLevel === 'normalize' || e.audioLevel === 'even') f.push('loudnorm=I=-14:TP=-1.5:LRA=11', 'aresample=48000')
  return f
}

/** Algo para a imagem (sem contar o som)? */
export function hasImageEnhance(e: EnhanceSettings): boolean {
  return e.upscaler !== 'none' || cleanFilters(e).length > 0 || lookFilters(e).length > 0 || e.stabilize !== 'off'
}

/** Quantos ajustes estão ligados (para o pontinho e o resumo) */
export function enhanceCount(e: EnhanceSettings): { image: number; audio: number } {
  const image = [
    e.upscaler !== 'none',
    e.deinterlace,
    e.denoise > 0,
    e.deblock > 0,
    e.deband,
    e.sharpen > 0,
    !!(e.brightness || e.contrast || e.saturation || e.gamma || e.vibrance || e.warmth || e.autoLight),
    e.stabilize !== 'off',
    e.deflicker,
    e.grain > 0
  ].filter(Boolean).length
  const audio = [e.audioCut, e.audioDenoise > 0, e.audioLevel !== 'off'].filter(Boolean).length
  return { image, audio }
}

export interface EnhancePreset {
  id: string
  name: string
  hint: string
  patch: Partial<EnhanceSettings>
}

/** Receitas prontas: um clique liga vários ajustes de uma vez (tudo continua editável) */
export const ENHANCE_PRESETS: EnhancePreset[] = [
  {
    id: 'compressed',
    name: 'Muito comprimido',
    hint: 'Vídeo de WhatsApp ou repostado várias vezes: tira os quadradinhos e o ruído, devolve a nitidez',
    patch: { deblock: 5, denoise: 3, denoiseMethod: 'fast', deband: true, sharpen: 4, sharpenMethod: 'cas' }
  },
  {
    id: 'old',
    name: 'Vídeo antigo / VHS',
    hint: 'Desentrelaça, tira o ruído forte e o tremor de luz, amplia com IA e dá um pouco mais de cor',
    patch: { upscaler: 'esrgan', esrganModel: 'realesr-animevideov3', upScale: 0, deinterlace: true, denoise: 5, denoiseMethod: 'quality', deflicker: true, saturation: 10, contrast: 8, sharpen: 3 }
  },
  {
    id: 'dark',
    name: 'Celular no escuro',
    hint: 'Clareia as sombras, corrige a luz e reduz o granulado típico de pouca luz',
    patch: { autoLight: true, gamma: 25, denoise: 5, denoiseMethod: 'quality', sharpen: 2, audioDenoise: 4 }
  },
  {
    id: 'anime',
    name: 'Anime / desenho',
    hint: 'Real-CUGAN: traços limpos e cores chapadas sem ruído',
    patch: { upscaler: 'cugan', cuganModel: 'se', upScale: 0, cuganNoise: 1, deband: true }
  },
  {
    id: 'sharp',
    name: 'Só nitidez leve',
    hint: 'Um toque de nitidez e cor, sem pesar no tempo de preparo',
    patch: { sharpen: 3, sharpenMethod: 'cas', vibrance: 15 }
  },
  {
    id: 'vivid',
    name: 'Cores vivas',
    hint: 'Mais contraste e cores fortes, bom para paisagem e carros',
    patch: { contrast: 12, vibrance: 35, saturation: 8, sharpen: 2 }
  },
  {
    id: 'voice',
    name: 'Voz limpa',
    hint: 'Só no som: tira ronco e chiado e deixa o volume no padrão das redes',
    patch: { audioCut: true, audioDenoise: 5, audioLevel: 'normalize' }
  }
]
