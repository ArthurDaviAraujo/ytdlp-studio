import { app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, extname, join } from 'path'
import { randomUUID } from 'crypto'
import type { ExportSettings, MediaInfo } from '../shared/types'
import { isV4Model } from '../shared/presets'
import { getToolStatus } from './tools'
import { encoderArgs, listH264Encoders } from './convert'
import { probe } from './media'

export interface ExportHooks {
  progress: (percent: number | null, stage?: string) => void
  log: (line: string) => void
  spawned: (child: ChildProcess | null) => void
  canceled: () => boolean
}

export interface ExportResult {
  ok: boolean
  output: string | null
  error: string | null
}

const METHOD_LABEL = { duplicate: 'duplicando quadros', gpu: 'placa AMD', cpu: 'processador', ai: 'IA (RIFE)' }

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/** "1:02:03" | "62:03" | "75.5" → segundos */
export function parseTime(s: string): number | null {
  s = (s ?? '').trim()
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  const parts = s.split(':').map(Number)
  if (parts.some((p) => isNaN(p))) return null
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

export function outputPath(input: string, suffix: string): string {
  const base = input.slice(0, input.length - extname(input).length)
  let p = `${base}.${suffix || 'editado'}.mp4`
  for (let i = 2; existsSync(p); i++) p = `${base}.${suffix || 'editado'} (${i}).mp4`
  return p
}

interface Geometry {
  W: number
  H: number
  filter: string
}

function geometry(info: MediaInfo, s: ExportSettings): Geometry {
  const W = even(s.width || info.width)
  const H = even(s.height || info.height)
  const srcAR = info.width / info.height
  const dstAR = W / H
  if (Math.abs(srcAR - dstAR) < 0.01) return { W, H, filter: `scale=${W}:${H}:flags=lanczos,setsar=1` }

  if (s.framing === 'crop') {
    let crop: string
    if (srcAR > dstAR) {
      const cw = Math.min(info.width, even(info.height * dstAR))
      crop = `crop=${cw}:${info.height}:${Math.round(((info.width - cw) * s.position) / 100)}:0`
    } else {
      const ch = Math.min(info.height, even(info.width / dstAR))
      crop = `crop=${info.width}:${ch}:0:${Math.round(((info.height - ch) * s.position) / 100)}`
    }
    return { W, H, filter: `${crop},scale=${W}:${H}:flags=lanczos,setsar=1` }
  }

  const fit = `scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`
  if (s.framing === 'bars') {
    const color = '0x' + (/^#?[0-9a-f]{6}$/i.test(s.barColor) ? s.barColor.replace('#', '') : '000000')
    return { W, H, filter: `${fit},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${color},setsar=1` }
  }

  // Fundo: o próprio vídeo ampliado e desfocado, calculado em 1/4 do tamanho para ficar rápido
  const w4 = even(W / 4)
  const h4 = even(H / 4)
  const lr = Math.max(1, Math.min(Math.round(s.blur), Math.floor(Math.min(w4, h4) / 2) - 1))
  const cr = Math.max(1, Math.min(lr, Math.floor(Math.min(w4, h4) / 4) - 1))
  return {
    W,
    H,
    filter:
      `split[bg0][fg0];[bg0]scale=${w4}:${h4}:force_original_aspect_ratio=increase,crop=${w4}:${h4},` +
      `boxblur=lr=${lr}:lp=2:cr=${cr}:cp=2,scale=${W}:${H}[bg];[fg0]${fit}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1`
  }
}

function atempo(speed: number): string {
  const parts: string[] = []
  let r = speed
  while (r < 0.5) {
    parts.push('atempo=0.5')
    r /= 0.5
  }
  parts.push(`atempo=${r.toFixed(6)}`)
  return parts.join(',')
}

function runFfmpeg(args: string[], totalSec: number, hooks: ExportHooks, onPercent?: (p: number) => void): Promise<{ code: number | null; tail: string[] }> {
  const ffmpeg = getToolStatus().ffmpeg.path!
  return new Promise((resolve) => {
    hooks.log(`> ffmpeg ${args.join(' ')}`)
    const child = spawn(ffmpeg, args, { windowsHide: true })
    hooks.spawned(child)
    const tail: string[] = []
    let buf = ''
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8')
      const lines = buf.split(/\r?\n/)
      buf = lines.pop() ?? ''
      for (const l of lines) {
        const m = l.match(/^out_time_us=(\d+)/)
        if (m && totalSec > 0) onPercent?.(Math.min(100, (Number(m[1]) / 1e6 / totalSec) * 100))
      }
    })
    child.stderr.on('data', (d: Buffer) => {
      for (const l of d.toString('utf8').split(/\r?\n/)) {
        if (!l.trim()) continue
        tail.push(l)
        if (tail.length > 40) tail.shift()
        hooks.log(`[ffmpeg] ${l}`)
      }
    })
    child.on('error', (e) => resolve({ code: -1, tail: [e.message] }))
    child.on('close', (code) => {
      hooks.spawned(null)
      resolve({ code, tail })
    })
  })
}

function runRife(exe: string, args: string[], outDir: string, expected: number, hooks: ExportHooks, onPercent: (p: number) => void): Promise<{ code: number | null; tail: string[] }> {
  return new Promise((resolve) => {
    hooks.log(`> ${exe} ${args.join(' ')}`)
    const child = spawn(exe, args, { windowsHide: true, cwd: dirname(exe) })
    hooks.spawned(child)
    const tail: string[] = []
    const onData = (d: Buffer) => {
      for (const l of d.toString('utf8').split(/\r?\n/)) {
        if (!l.trim() || / done$/.test(l)) continue
        tail.push(l)
        if (tail.length > 40) tail.shift()
        hooks.log(`[rife] ${l}`)
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    // O RIFE não informa progresso; conta os quadros que já gravou
    const timer = setInterval(() => {
      try {
        onPercent(Math.min(100, (readdirSync(outDir).length / expected) * 100))
      } catch {
        // pasta ainda não existe
      }
    }, 500)
    child.on('error', (e) => resolve({ code: -1, tail: [e.message] }))
    child.on('close', (code) => {
      clearInterval(timer)
      hooks.spawned(null)
      resolve({ code, tail })
    })
  })
}

const fail = (error: string): ExportResult => ({ ok: false, output: null, error })

export async function exportVideo(input: string, s: ExportSettings, hooks: ExportHooks): Promise<ExportResult> {
  const tools = getToolStatus()
  if (!tools.ffmpeg.path) return fail('ffmpeg.exe não encontrado')
  let info: MediaInfo
  try {
    info = await probe(input)
  } catch (e) {
    return fail((e as Error).message)
  }

  const start = Math.max(0, parseTime(s.start) ?? 0)
  const end = Math.min(info.duration || Infinity, parseTime(s.end) ?? Infinity)
  const dur = (isFinite(end) ? end : info.duration) - start
  if (!(dur > 0)) return fail('O trecho escolhido está vazio (confira início e fim)')

  const speed = s.speed > 0 ? s.speed : 1
  const outDur = dur / speed
  const srcFps = info.fps || 30
  const effFps = srcFps * speed
  const target = s.fps || srcFps
  const generate = target > effFps * 1.001
  const geo = geometry(info, s)
  const encoders = await listH264Encoders()
  const encoder = s.encoder && encoders.includes(s.encoder) ? s.encoder : (encoders[0] ?? 'libx264')
  const output = outputPath(input, s.suffix)
  const keepAudio = s.audio && info.hasAudio

  hooks.log(
    `[app] ${info.width}x${info.height} ${srcFps.toFixed(3)} fps → ${geo.W}x${geo.H} ${target.toFixed(3)} fps` +
      (generate ? ` (${METHOD_LABEL[s.method]})` : '') +
      (speed !== 1 ? `, velocidade ${speed}x` : '') +
      `, trecho ${start.toFixed(2)}–${(start + dur).toFixed(2)} s`
  )

  if (generate && s.method === 'ai') {
    if (!tools.rife.models.length) return fail('RIFE não encontrado. Coloque a pasta rife ao lado do yt-dlp.exe ou indique o caminho em Configurações.')
    return exportWithAi(input, info, s, { start, dur, speed, outDur, srcFps, target, geo, encoder, output, keepAudio }, hooks)
  }

  const vf = [geo.filter]
  if (speed !== 1) vf.push(`setpts=PTS/${speed}`)
  let inDur = dur
  if (generate && s.method === 'gpu') {
    // O frc_amf entrega a imagem 2 quadros atrasada (medido); o trim compensa e o trecho lido fica um pouco maior
    const delay = 2 / effFps
    inDur = Math.min(dur + delay * speed, (info.duration || Infinity) - start)
    vf.push(
      `format=yuv420p,frc_amf=profile=${geo.W * geo.H > 2560 * 1440 ? 'super' : 'high'},hwdownload,format=nv12,` +
        `trim=start=${delay.toFixed(6)},setpts=PTS-STARTPTS`
    )
    // A placa só dobra; o fps= completa o resto e deixa a taxa constante
    vf.push(`fps=${target}`)
  } else if (generate && s.method === 'cpu') {
    vf.push(`minterpolate=fps=${target}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`)
  } else if (generate || s.fps || speed !== 1) {
    vf.push(`fps=${target}`)
  }

  const args = ['-hide_banner', '-y', '-ss', start.toFixed(3), '-t', inDur.toFixed(3), '-i', input, '-vf', vf.join(','), '-map', '0:v:0']
  if (keepAudio) {
    args.push('-map', '0:a:0')
    if (speed !== 1) args.push('-af', atempo(speed))
    args.push('-c:a', 'aac', '-b:a', `${s.audioKbps}k`)
  } else args.push('-an')
  args.push(...encoderArgs(encoder, s.quality, s.maxBitrate), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', outDur.toFixed(3), '-progress', 'pipe:1', '-nostats', output)

  hooks.progress(0, `Preparando: ${s.name}`)
  const r = await runFfmpeg(args, outDur, hooks, (p) => hooks.progress(p))
  if (hooks.canceled()) {
    if (existsSync(output)) rmSync(output, { force: true })
    return fail('Cancelado')
  }
  if (r.code !== 0) {
    if (existsSync(output)) rmSync(output, { force: true })
    return fail(r.tail.slice(-4).join('\n') || `ffmpeg terminou com código ${r.code}`)
  }
  return { ok: true, output, error: null }
}

interface AiPlan {
  start: number
  dur: number
  speed: number
  outDur: number
  srcFps: number
  target: number
  geo: Geometry
  encoder: string
  output: string
  keepAudio: boolean
}

async function exportWithAi(input: string, info: MediaInfo, s: ExportSettings, p: AiPlan, hooks: ExportHooks): Promise<ExportResult> {
  const rife = getToolStatus().rife
  const model = rife.models.includes(s.aiModel) ? s.aiModel : rife.models[0]
  if (!model) return fail('Nenhum modelo do RIFE encontrado')
  // Cada modelo roda com o programa da instalação de onde veio (oficial ou comunidade)
  const { dir: modelDir, exe } = rife.info[model]
  const v4 = isV4Model(model)
  const S = p.srcFps
  const ratio = p.target / (S * p.speed)

  const tmp = join(app.getPath('temp'), `yt-dlp-gui-${randomUUID()}`)
  const inDir = join(tmp, 'in')
  const outDir = join(tmp, 'out')
  const partsDir = join(tmp, 'parts')
  const resetDirs = () => {
    for (const d of [inDir, outDir]) {
      rmSync(d, { recursive: true, force: true })
      mkdirSync(d, { recursive: true })
    }
  }
  mkdirSync(partsDir, { recursive: true })

  // Quantos quadros por pedaço: ~2 GB de imagens temporárias no máximo
  const totalFrames = Math.max(1, Math.round(p.dur * S))
  const perChunk = Math.min(300, Math.max(24, Math.floor(4e8 / (p.geo.W * p.geo.H))))
  const chunks = Math.ceil(totalFrames / perChunk)
  hooks.log(`[app] IA: modelo ${model}, ${totalFrames} quadros em ${chunks} pedaço(s), fator ${ratio.toFixed(3)}x`)

  const parts: string[] = []
  try {
    for (let c = 0; c < chunks; c++) {
      if (hooks.canceled()) return fail('Cancelado')
      const stage = `IA (RIFE ${model}): pedaço ${c + 1} de ${chunks}`
      const report = (frac: number) => hooks.progress(((c + frac) / chunks) * 100, stage)
      report(0)
      resetDirs()

      const k0 = c * perChunk
      const n = Math.min(perChunk, totalFrames - k0)
      let last = c === chunks - 1
      // Um quadro a mais no fim de cada pedaço para a IA ligar este pedaço ao próximo
      const want = last ? n : n + 1
      const ss = c === 0 ? p.start : p.start + (k0 - 0.5) / S
      const ex = await runFfmpeg(
        ['-hide_banner', '-v', 'error', '-y', '-ss', ss.toFixed(4), '-i', input, '-vf', `${p.geo.filter},fps=${S}`, '-frames:v', String(want), '-start_number', '1', join(inDir, '%08d.png')],
        0,
        hooks
      )
      if (hooks.canceled()) return fail('Cancelado')
      if (ex.code !== 0) return fail(ex.tail.slice(-4).join('\n') || 'Falha ao separar os quadros')
      const nIn = readdirSync(inDir).length
      if (!nIn) break
      if (nIn < want) last = true
      const nMain = last ? nIn : nIn - 1
      report(0.1)

      let keep: number
      let frameDir = inDir
      if (nIn >= 2) {
        const nOut = v4 ? Math.max(nIn + 1, Math.round(nIn * ratio)) : nIn * 2
        keep = last ? nOut : v4 ? Math.round(nMain * ratio) : nMain * 2
        // Só os modelos v4 aceitam -n; os outros sempre dobram (o padrão do RIFE)
        const args = ['-i', inDir, '-o', outDir, '-m', modelDir, ...(v4 ? ['-n', String(nOut)] : []), '-f', '%08d.png', '-j', '2:2:2', '-v']
        if (s.aiUhd) args.push('-u')
        if (s.aiTtaSpatial) args.push('-x')
        if (s.aiTtaTemporal) args.push('-z')
        const rr = await runRife(exe, args, outDir, nOut, hooks, (pct) => report(0.1 + (pct / 100) * 0.75))
        if (hooks.canceled()) return fail('Cancelado')
        if (rr.code !== 0 || readdirSync(outDir).length < keep) return fail(`O RIFE falhou: ${rr.tail.slice(-3).join(' ') || `código ${rr.code}`}`)
        frameDir = outDir
      } else {
        keep = 1
      }

      // Taxa de entrada que faz os quadros gerados ocuparem exatamente o tempo do pedaço; o fps= ajusta ao FPS final
      const inRate = (keep * S * p.speed) / nMain
      const part = join(partsDir, `${String(c).padStart(5, '0')}.mp4`)
      const en = await runFfmpeg(
        [
          '-hide_banner', '-v', 'error', '-y', '-framerate', inRate.toFixed(6), '-start_number', '1', '-i', join(frameDir, '%08d.png'),
          '-frames:v', String(keep), '-vf', `fps=${p.target},format=yuv420p`, ...encoderArgs(p.encoder, s.quality, s.maxBitrate), '-an', part
        ],
        0,
        hooks
      )
      if (hooks.canceled()) return fail('Cancelado')
      if (en.code !== 0) return fail(en.tail.slice(-4).join('\n') || 'Falha ao gravar o pedaço')
      parts.push(part)
      report(1)
      if (last) break
    }

    if (!parts.length) return fail('Nenhum quadro foi lido do vídeo')
    const list = join(tmp, 'parts.txt')
    writeFileSync(list, parts.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'))
    const args = ['-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', list]
    if (p.keepAudio) args.push('-ss', p.start.toFixed(3), '-t', p.dur.toFixed(3), '-i', input)
    args.push('-map', '0:v:0', '-c:v', 'copy')
    if (p.keepAudio) {
      args.push('-map', '1:a:0')
      if (p.speed !== 1) args.push('-af', atempo(p.speed))
      args.push('-c:a', 'aac', '-b:a', `${s.audioKbps}k`)
    }
    args.push('-movflags', '+faststart', '-t', p.outDur.toFixed(3), p.output)
    hooks.progress(100, 'Juntando vídeo e áudio')
    const fin = await runFfmpeg(args, 0, hooks)
    if (hooks.canceled()) return fail('Cancelado')
    if (fin.code !== 0) return fail(fin.tail.slice(-4).join('\n') || 'Falha ao juntar o vídeo')
    return { ok: true, output: p.output, error: null }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
    if (hooks.canceled() && existsSync(p.output)) rmSync(p.output, { force: true })
  }
}
