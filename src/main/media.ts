import { spawn } from 'child_process'
import { statSync } from 'fs'
import type { MediaInfo } from '../shared/types'
import { getToolStatus } from './tools'
import { t } from '../shared/i18n'

function capture(bin: string, args: string[]): Promise<{ code: number | null; out: Buffer; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true })
    const out: Buffer[] = []
    let err = ''
    child.stdout.on('data', (d: Buffer) => out.push(d))
    child.stderr.on('data', (d: Buffer) => (err += d.toString('utf8')))
    child.on('error', (e) => resolve({ code: -1, out: Buffer.alloc(0), err: e.message }))
    child.on('close', (code) => resolve({ code, out: Buffer.concat(out), err }))
  })
}

const rate = (r?: string) => {
  if (!r) return 0
  const [n, d] = r.split('/').map(Number)
  return d ? n / d : n || 0
}

export async function probe(path: string): Promise<MediaInfo> {
  const ffprobe = getToolStatus().ffprobe.path
  if (!ffprobe) throw new Error(t('ffprobe.exe não encontrado (veja Configurações)'))
  const r = await capture(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path])
  if (r.code !== 0) throw new Error(r.err.trim() || t('Não consegui ler o vídeo'))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j: any = JSON.parse(r.out.toString('utf8'))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = j.streams?.find((s: any) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = j.streams?.find((s: any) => s.codec_type === 'audio')
  if (!v) throw new Error(t('O arquivo não tem vídeo'))
  // Vídeos de celular guardam a rotação à parte; o ffmpeg gira sozinho ao decodificar
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rotation = Number(v.side_data_list?.find((s: any) => s.rotation != null)?.rotation ?? v.tags?.rotate ?? 0)
  const swap = Math.abs(rotation) % 180 === 90
  return {
    path,
    width: swap ? v.height : v.width,
    height: swap ? v.width : v.height,
    fps: rate(v.avg_frame_rate) || rate(v.r_frame_rate),
    duration: Number(j.format?.duration ?? v.duration ?? 0),
    hasAudio: !!a,
    vcodec: v.codec_name ?? '',
    acodec: a?.codec_name ?? '',
    size: Number(j.format?.size ?? statSync(path).size)
  }
}

/** Um quadro do vídeo em JPEG (data URL) para a prévia do enquadramento. */
export async function frame(path: string, time: number, width = 640, keyframe = false): Promise<string | null> {
  const ffmpeg = getToolStatus().ffmpeg.path
  if (!ffmpeg) return null
  // keyframe: só decodifica quadros-chave (bem mais rápido em 4K); serve para miniaturas, onde uns segundos de diferença não importam
  const skip = keyframe ? ['-skip_frame', 'nokey'] : []
  const args = ['-hide_banner', '-v', 'error', ...skip, '-ss', String(Math.max(0, time)), '-i', path, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '5', 'pipe:1']
  const r = await capture(ffmpeg, args)
  if (r.code !== 0 || !r.out.length) return null
  return `data:image/jpeg;base64,${r.out.toString('base64')}`
}

/** Miniaturas para a linha do tempo do editor; busca cada quadro direto (rápido mesmo em vídeos longos), 4 por vez. */
export async function thumbs(path: string, times: number[], width = 160): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(times.length).fill(null)
  let next = 0
  const worker = async () => {
    while (next < times.length) {
      const i = next++
      out[i] = await frame(path, times[i], width, true)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return out
}

/** Picos do áudio (0–1) em `buckets` partes iguais, para desenhar a onda. Vazio se o vídeo não tem áudio. */
export async function peaks(path: string, buckets: number): Promise<number[]> {
  const ffmpeg = getToolStatus().ffmpeg.path
  if (!ffmpeg) return []
  // Mono a 2000 amostras/s basta para a forma da onda e é rápido de decodificar
  const r = await capture(ffmpeg, ['-hide_banner', '-v', 'error', '-i', path, '-map', '0:a:0', '-ac', '1', '-ar', '2000', '-f', 's16le', 'pipe:1'])
  if (r.code !== 0 || r.out.length < 4) return []
  const n = Math.floor(r.out.length / 2)
  const per = Math.max(1, n / buckets)
  const res: number[] = []
  let max = 1
  for (let b = 0; b < buckets; b++) {
    let peak = 0
    const from = Math.floor(b * per)
    const to = Math.min(n, Math.floor((b + 1) * per))
    for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(r.out.readInt16LE(i * 2)))
    res.push(peak)
    max = Math.max(max, peak)
  }
  return res.map((p) => Math.round((p / max) * 1000) / 1000)
}

/** Duração de um arquivo de áudio (para a música de fundo); null se não der para ler. */
export async function audioDuration(path: string): Promise<number | null> {
  const ffprobe = getToolStatus().ffprobe.path
  if (!ffprobe) return null
  const r = await capture(ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'format=duration', '-of', 'csv=p=0', path])
  const d = Number(r.out.toString('utf8').trim())
  return r.code === 0 && d > 0 ? d : null
}
