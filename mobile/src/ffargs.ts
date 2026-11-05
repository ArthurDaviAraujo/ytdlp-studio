import type { ExportSettings } from '../../src/shared/types'
import { enhanceOf, lookFilters } from '../../src/shared/enhance'
import { overlayOf, placeXY } from '../../src/shared/overlay'
import type { ProbeInfo } from './native'

/**
 * Monta o comando do ffmpeg do "Preparar" no celular. É a mesma ideia do app de PC (tamanho, enquadramento,
 * velocidade, FPS, cor, nitidez, texto), mais enxuta: sem as IAs pesadas e sem os filtros lentos demais para celular.
 */

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

export function geometry(info: ProbeInfo, s: ExportSettings): { W: number; H: number; filter: string; crop: { w: number; h: number; x: number; y: number } | null } {
  const W = even(s.width || info.width)
  const H = even(s.height || info.height)
  const srcAR = info.width / info.height
  const dstAR = W / H
  const zoom = s.framing === 'crop' ? Math.max(1, s.zoom || 1) : 1
  if (Math.abs(srcAR - dstAR) < 0.01 && zoom === 1) return { W, H, filter: `scale=${W}:${H}:flags=lanczos,setsar=1`, crop: null }
  if (s.framing === 'crop') {
    const cw = Math.min(info.width, even((srcAR > dstAR ? info.height * dstAR : info.width) / zoom))
    const ch = Math.min(info.height, even((srcAR > dstAR ? info.height : info.width / dstAR) / zoom))
    const x = Math.round(((info.width - cw) * (s.position ?? 50)) / 100)
    const y = Math.round(((info.height - ch) * (s.positionY ?? 50)) / 100)
    return { W, H, filter: `crop=${cw}:${ch}:${x}:${y},scale=${W}:${H}:flags=lanczos,setsar=1`, crop: { w: cw, h: ch, x, y } }
  }
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`
  if (s.framing === 'bars') {
    const color = '0x' + (/^#?[0-9a-f]{6}$/i.test(s.barColor) ? s.barColor.replace('#', '') : '000000')
    return { W, H, filter: `${fit},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${color},setsar=1`, crop: null }
  }
  const w4 = even(W / 4)
  const h4 = even(H / 4)
  const lr = Math.max(1, Math.min(Math.round(s.blur), Math.floor(Math.min(w4, h4) / 2) - 1))
  return {
    W,
    H,
    filter: `split[bg0][fg0];[bg0]scale=${w4}:${h4}:force_original_aspect_ratio=increase,crop=${w4}:${h4},boxblur=${lr}:2,scale=${W}:${H}[bg];[fg0]${fit}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1`,
    crop: null
  }
}

/** Velocidade do som sem mudar o tom (atempo só aceita de 0,5 a 2 por vez) */
export function atempo(speed: number): string {
  const parts: string[] = []
  let r = speed
  while (r < 0.5) {
    parts.push('atempo=0.5')
    r /= 0.5
  }
  while (r > 2) {
    parts.push('atempo=2')
    r /= 2
  }
  parts.push(`atempo=${r.toFixed(6)}`)
  return parts.join(',')
}

export function encoderArgs(enc: string, q: number): string[] {
  switch (enc) {
    case 'libx265':
      return ['-c:v', 'libx265', '-preset', 'faster', '-crf', String(q + 1), '-tag:v', 'hvc1']
    case 'h264_mediacodec':
      return ['-c:v', 'h264_mediacodec', '-b:v', `${Math.round(24 - q * 0.5)}M`]
    case 'hevc_mediacodec':
      return ['-c:v', 'hevc_mediacodec', '-b:v', `${Math.round(18 - q * 0.4)}M`, '-tag:v', 'hvc1']
    default:
      // "veryfast": no celular o "medium" do PC demora demais
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(q)]
  }
}

const ffPath = (p: string) => `'${p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''")}'`

/** Texto por cima (fonte do próprio Android) */
export function textFilter(s: ExportSettings, W: number, H: number, textFile: string | null): string | null {
  const o = overlayOf(s)
  if (!o.text.trim() || !textFile) return null
  const m = Math.round(Math.min(W, H) * 0.04)
  const longest = Math.max(1, ...o.text.split('\n').map((l) => [...l].length))
  const fs = Math.max(8, Math.min(Math.round((H * o.textSize) / 100), Math.floor((W - 2 * m) / (longest * 0.56))))
  const { x, y } = placeXY(o.textPos, 'w', 'h', 'text_w', 'text_h', m)
  const color = '0x' + (/^#?[0-9a-f]{6}$/i.test(o.textColor) ? o.textColor.replace('#', '') : 'ffffff')
  const look = o.textBox ? `:box=1:boxcolor=black@0.5:boxborderw=${Math.round(fs * 0.35)}` : `:borderw=${Math.max(2, Math.round(fs / 16))}:bordercolor=black@0.8`
  return `drawtext=fontfile=${ffPath('/system/fonts/Roboto-Bold.ttf')}:textfile=${ffPath(textFile)}:expansion=none:fontsize=${fs}:fontcolor=${color}:x=${x}:y=${y}${look}`
}

export interface PrepPlan {
  args: string[]
  outDur: number
  W: number
  H: number
}

/** Preparo sem IA: um ffmpeg só, do arquivo de entrada até o arquivo final */
export function planPrepare(input: string, output: string, info: ProbeInfo, s: ExportSettings, textFile: string | null, encoder: string): PrepPlan {
  const start = Math.max(0, parseTime(s.start) ?? 0)
  const end = Math.min(info.duration || Infinity, parseTime(s.end) ?? Infinity)
  const dur = (isFinite(end) ? end : info.duration) - start
  const speed = s.speed > 0 ? s.speed : 1
  const geo = geometry(info, s)
  const e = enhanceOf(s)
  const vf = [geo.filter, ...lookFilters(e)]
  const txt = textFilter(s, geo.W, geo.H, textFile)
  if (txt) vf.push(txt)
  if (speed !== 1) vf.push(`setpts=PTS/${speed}`)
  if (s.fps || speed !== 1) vf.push(`fps=${s.fps || info.fps || 30}`)
  const args = ['-hide_banner', '-y', '-ss', start.toFixed(3), '-t', dur.toFixed(3), '-i', input, '-vf', vf.join(','), '-map', '0:v:0']
  if (s.audio && info.hasAudio) {
    args.push('-map', '0:a:0')
    if (speed !== 1) args.push('-af', atempo(speed))
    args.push('-c:a', 'aac', '-b:a', `${s.audioKbps}k`)
  } else args.push('-an')
  args.push(...encoderArgs(encoder, s.quality), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', (dur / speed).toFixed(3), '-progress', 'pipe:1', '-nostats', output)
  return { args, outDur: dur / speed, W: geo.W, H: geo.H }
}

/** "1:02:03" | "62:03" | "75.5" → segundos */
export function parseTime(v: string): number | null {
  v = (v ?? '').trim()
  if (!v) return null
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v)
  const parts = v.split(':').map(Number)
  if (parts.some((p) => isNaN(p))) return null
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}
