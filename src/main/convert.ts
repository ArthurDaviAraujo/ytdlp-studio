import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { existsSync, unlinkSync } from 'fs'
import { extname } from 'path'
import { getToolStatus } from './tools'
import { t } from '../shared/i18n'

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.flv', '.ts', '.m4v'])

export const isVideoFile = (p: string) => VIDEO_EXT.has(extname(p).toLowerCase())

const ENCODER_ORDER = ['h264_amf', 'h264_nvenc', 'h264_qsv', 'libx264', 'h264_mf', 'libopenh264']

let encodersCache: { ffmpeg: string; list: Promise<string[]> } | null = null

/** Testa um encoder com um vídeo de 0,1 s; os de GPU aparecem na lista do ffmpeg mesmo sem a placa. */
function encoderWorks(ffmpeg: string, enc: string): Promise<boolean> {
  return new Promise((resolve) => {
    const args = ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x144:d=0.1', '-pix_fmt', 'yuv420p', '-c:v', enc, '-f', 'null', '-']
    const child = spawn(ffmpeg, args, { windowsHide: true })
    const timer = setTimeout(() => child.kill(), 10000)
    child.on('error', () => resolve(false))
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })
  })
}

/** Encoders H.264 que funcionam nesta máquina, na ordem de preferência (GPU primeiro). */
export function listH264Encoders(): Promise<string[]> {
  const ffmpeg = getToolStatus().ffmpeg.path
  if (!ffmpeg) return Promise.resolve([])
  if (encodersCache?.ffmpeg === ffmpeg) return encodersCache.list
  const list = (async () => {
    const r = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8', windowsHide: true })
    const found = new Set([...(r.stdout ?? '').matchAll(/^\s*V\S*\s+(\w+)\s/gm)].map((m) => m[1]))
    const candidates = ENCODER_ORDER.filter((e) => found.has(e))
    const ok = await Promise.all(candidates.map((e) => (e === 'libx264' ? true : encoderWorks(ffmpeg, e))))
    return candidates.filter((_, i) => ok[i])
  })()
  encodersCache = { ffmpeg, list }
  return list
}

/** q: 14 (melhor) a 32 (menor arquivo). maxKbps > 0 limita a taxa de bits. */
export function encoderArgs(enc: string, q = 20, maxKbps = 0): string[] {
  const cap = maxKbps > 0 ? ['-maxrate', `${maxKbps}k`, '-bufsize', `${maxKbps * 2}k`] : []
  switch (enc) {
    case 'h264_amf':
      return maxKbps > 0
        ? ['-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'vbr_peak', '-b:v', `${Math.round(maxKbps * 0.8)}k`, '-maxrate', `${maxKbps}k`]
        : ['-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'cqp', '-qp_i', `${q}`, '-qp_p', `${q + 2}`, '-qp_b', `${q + 4}`]
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', `${q + 1}`, '-b:v', '0', ...cap]
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', 'slow', '-global_quality', `${q + 1}`, ...cap]
    case 'h264_mf':
      return ['-c:v', 'h264_mf', '-b:v', maxKbps > 0 ? `${maxKbps}k` : '16M']
    case 'libopenh264':
      return ['-c:v', 'libopenh264', '-b:v', maxKbps > 0 ? `${maxKbps}k` : '16M']
    default:
      return ['-c:v', 'libx264', '-preset', 'medium', '-crf', `${q}`, ...cap]
  }
}

let gpuCache: Promise<{ id: number; name: string }[]> | null = null

/** Placas que o RIFE enxerga. O "-l" só existe no RIFE da comunidade; as linhas "[0 Nome] queueC=..." saem ao iniciar a Vulkan. */
export function listRifeGpus(): Promise<{ id: number; name: string }[]> {
  if (gpuCache) return gpuCache
  const exes = [...new Set(Object.values(getToolStatus().rife.info).map((m) => m.exe))]
  gpuCache = (async () => {
    for (const exe of exes) {
      const out = await new Promise<string>((resolve) => {
        const child = spawn(exe, ['-l'], { windowsHide: true })
        let text = ''
        const add = (d: Buffer) => (text += d.toString('utf8'))
        child.stdout.on('data', add)
        child.stderr.on('data', add)
        const timer = setTimeout(() => child.kill(), 15000)
        child.on('error', () => resolve(''))
        child.on('close', () => {
          clearTimeout(timer)
          resolve(text)
        })
      })
      const found = new Map<number, string>()
      for (const m of out.matchAll(/^\[(\d+) (.+?)\]\s+queueC/gm)) found.set(Number(m[1]), m[2].trim())
      if (found.size) return [...found].map(([id, name]) => ({ id, name }))
    }
    return []
  })()
  return gpuCache
}

let frcCache: { ffmpeg: string; ok: Promise<boolean> } | null = null

/** A interpolação da AMD (frc_amf) aparece no ffmpeg mesmo sem placa AMD; testa de verdade. */
export function frcAmfWorks(): Promise<boolean> {
  const ffmpeg = getToolStatus().ffmpeg.path
  if (!ffmpeg) return Promise.resolve(false)
  if (frcCache?.ffmpeg === ffmpeg) return frcCache.ok
  const ok = new Promise<boolean>((resolve) => {
    const args = ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x144:r=10:d=0.5', '-vf', 'frc_amf', '-f', 'null', '-']
    const child = spawn(ffmpeg, args, { windowsHide: true })
    const timer = setTimeout(() => child.kill(), 15000)
    child.on('error', () => resolve(false))
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0)
    })
  })
  frcCache = { ffmpeg, ok }
  return ok
}

export function convertedPath(input: string): string {
  return input.slice(0, input.length - extname(input).length) + '.h264.mp4'
}

/** Converte para H.264 + AAC em MP4. Mantém legendas (como mov_text), capítulos e metadados. */
export function convertToH264(
  input: string,
  encoder: string,
  durationSec: number | null,
  onProgress: (percent: number | null, line: string) => void,
  onSpawn: (c: ChildProcess) => void
): Promise<{ ok: boolean; output: string; error: string | null }> {
  const ffmpeg = getToolStatus().ffmpeg.path
  const output = convertedPath(input)
  if (!ffmpeg) return Promise.resolve({ ok: false, output, error: t('ffmpeg.exe não encontrado') })
  const args = [
    '-hide_banner', '-y', '-i', input,
    '-map', '0:v:0', '-map', '0:a?', '-map', '0:s?',
    '-pix_fmt', 'yuv420p',
    ...encoderArgs(encoder),
    '-c:a', 'aac', '-b:a', '256k',
    '-c:s', 'mov_text',
    '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats',
    output
  ]
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, args, { windowsHide: true })
    onSpawn(child)
    let buf = ''
    const errTail: string[] = []
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8')
      const lines = buf.split(/\r?\n/)
      buf = lines.pop() ?? ''
      for (const l of lines) {
        const m = l.match(/^out_time_us=(\d+)/)
        if (m && durationSec) onProgress(Math.min(100, Number(m[1]) / 1e6 / durationSec * 100), '')
      }
    })
    child.stderr.on('data', (d: Buffer) => {
      for (const l of d.toString('utf8').split(/\r?\n/)) {
        if (!l.trim()) continue
        errTail.push(l)
        if (errTail.length > 30) errTail.shift()
        onProgress(null, `[ffmpeg] ${l}`)
      }
    })
    child.on('error', (e) => resolve({ ok: false, output, error: e.message }))
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, output, error: null })
      else {
        if (existsSync(output)) {
          try {
            unlinkSync(output)
          } catch {
            // arquivo parcial em uso; fica para trás
          }
        }
        resolve({ ok: false, output, error: errTail.slice(-5).join('\n') || t('ffmpeg terminou com código {code}', { code: String(code) }) })
      }
    })
  })
}
