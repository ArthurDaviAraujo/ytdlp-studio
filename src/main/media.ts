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
export async function frame(path: string, time: number): Promise<string | null> {
  const ffmpeg = getToolStatus().ffmpeg.path
  if (!ffmpeg) return null
  const args = ['-hide_banner', '-v', 'error', '-ss', String(Math.max(0, time)), '-i', path, '-frames:v', '1', '-vf', 'scale=640:-2', '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '4', 'pipe:1']
  const r = await capture(ffmpeg, args)
  if (r.code !== 0 || !r.out.length) return null
  return `data:image/jpeg;base64,${r.out.toString('base64')}`
}
