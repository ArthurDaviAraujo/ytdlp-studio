import { useEffect, useState } from 'react'
import type { ExportSettings } from '../../src/shared/types'
import { enhanceOf } from '../../src/shared/enhance'
import { engine, isNative, type ProbeInfo } from './native'
import { planPrepare, geometry, encoderArgs, parseTime, atempo } from './ffargs'
import { modelDir } from './packs'
import { t } from '../../src/shared/i18n'

/** Um item da fila: download do site ou preparo de um vídeo */
export interface MJob {
  id: string
  kind: 'download' | 'prepare'
  title: string
  thumbnail: string | null
  label: string
  status: 'queued' | 'running' | 'done' | 'error' | 'canceled'
  percent: number | null
  stage: string
  /** Arquivo final na galeria (content://) e no app */
  uri: string | null
  file: string | null
  mime: string
  error: string | null
  createdAt: number
  req: DownloadReq | PrepareReq
}

export interface DownloadReq {
  type: 'download'
  url: string
  mode: 'video' | 'audio'
  /** 0 = o maior que tiver */
  height: number
  audioFormat: 'mp3' | 'm4a'
  /** Preparar depois de baixar */
  prepare: ExportSettings | null
}

export interface PrepareReq {
  type: 'prepare'
  input: string
  settings: ExportSettings
}

const KEY = 'mobile-jobs'
let jobs: MJob[] = (() => {
  try {
    // Ao abrir de novo, o que estava rodando não está mais
    return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as MJob[]).map((j) => (j.status === 'running' || j.status === 'queued' ? { ...j, status: 'canceled', stage: t('Interrompido') } : j))
  } catch {
    return []
  }
})()
const subs = new Set<(j: MJob[]) => void>()
const emit = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(jobs))
  } catch {
    // ignora
  }
  subs.forEach((s) => s([...jobs]))
}
const patch = (id: string, p: Partial<MJob>) => {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...p } : j))
  emit()
}

export function useJobs(): MJob[] {
  const [list, setList] = useState(jobs)
  useEffect(() => {
    subs.add(setList)
    return () => void subs.delete(setList)
  }, [])
  return list
}

// Progresso que vem do Android
void engine.addListener('progress', (e) => {
  const j = jobs.find((x) => x.id === current?.job && x.status === 'running')
  if (!j || !current || e.id !== current.run) return
  const p = parseProgress(e.line, current.duration)
  const pct = p ?? e.percent
  if (pct != null) patch(j.id, { percent: current.from + (pct * (current.to - current.from)) / 100 })
})

let current: { job: string; run: string; from: number; to: number; duration: number } | null = null

function parseProgress(line: string, duration: number): number | null {
  const d = line.match(/\[download\]\s+([\d.]+)%/)
  if (d) return Number(d[1])
  const o = line.match(/out_time_us=(\d+)/)
  if (o && duration > 0) return Math.min(100, Number(o[1]) / 1e6 / duration * 100)
  return null
}

const uid = () => Math.random().toString(36).slice(2, 10)

export function addJob(kind: MJob['kind'], title: string, thumbnail: string | null, label: string, req: DownloadReq | PrepareReq): void {
  jobs = [{ id: uid(), kind, title, thumbnail, label, status: 'queued', percent: null, stage: t('Na fila'), uri: null, file: null, mime: 'video/mp4', error: null, createdAt: Date.now(), req }, ...jobs]
  emit()
  void pump()
}

export function cancelJob(id: string): void {
  const j = jobs.find((x) => x.id === id)
  if (!j) return
  if (j.status === 'queued') patch(id, { status: 'canceled', stage: t('Cancelado') })
  if (j.status === 'running' && current?.job === id) {
    canceledJobs.add(id)
    void engine.cancel({ id: current.run })
  }
}

export function removeJob(id: string): void {
  jobs = jobs.filter((j) => j.id !== id)
  emit()
}

const canceledJobs = new Set<string>()
let busy = false
let tmpCleaned = false

async function pump(): Promise<void> {
  if (busy) return
  const next = [...jobs].reverse().find((j) => j.status === 'queued')
  if (!next) return
  busy = true
  patch(next.id, { status: 'running', percent: 0, stage: t('Começando…') })
  const { cache } = await engine.dirs()
  // Sobras de trabalhos interrompidos (app fechado no meio): nada está rodando agora
  if (!tmpCleaned) {
    tmpCleaned = true
    await engine.remove({ path: `${cache}/tmp` }).catch(() => undefined)
  }
  try {
    if (next.req.type === 'download') await runDownload(next.id, next.req)
    else await runPrepare(next.id, next.req.input, next.req.settings, next.title)
  } catch (e) {
    patch(next.id, { status: 'error', stage: t('Erro'), error: (e as Error).message })
  }
  // Quadros, pedaços e listas deste trabalho (centenas de MB com as IAs)
  await engine.remove({ path: `${cache}/tmp`, prefix: `${next.id}-` }).catch(() => undefined)
  canceledJobs.delete(next.id)
  busy = false
  void pump()
}

/** Roda um passo (yt-dlp, ffmpeg ou IA) e encaixa o progresso dele numa faixa da barra */
async function step<T>(job: string, from: number, to: number, duration: number, stage: string, fn: (run: string) => Promise<T>): Promise<T> {
  const run = uid()
  current = { job, run, from, to, duration }
  patch(job, { stage, percent: from })
  try {
    return await fn(run)
  } finally {
    current = null
  }
}

const check = (job: string, r: { code: number; err: string }, what: string) => {
  if (canceledJobs.has(job)) throw new Error(t('Cancelado'))
  if (r.code !== 0) throw new Error(`${what}: ${r.err.trim().split('\n').slice(-2).join(' ') || r.code}`)
}

async function runDownload(id: string, req: DownloadReq): Promise<void> {
  const { cache } = await engine.dirs()
  const fmt =
    req.mode === 'audio'
      ? ['-f', 'bestaudio/best', '-x', '--audio-format', req.audioFormat, '--audio-quality', '0']
      : ['-f', req.height ? `bv*[height<=${req.height}]+ba/b[height<=${req.height}]/b` : 'bv*+ba/b', '--merge-output-format', 'mp4', '-S', 'vcodec:h264,res,fps']
  const args = [...fmt, '--newline', '--no-playlist', '--restrict-filenames', '-o', `${cache}/dl/%(title).80s [%(id)s].%(ext)s`, '--print', 'after_move:filepath', '--no-simulate', req.url]
  const r = await step(id, 0, req.prepare ? 70 : 98, 0, t('Baixando'), (run) => engine.ytdlp({ id: run, args }))
  if (canceledJobs.has(id)) return void patch(id, { status: 'canceled', stage: t('Cancelado') })
  check(id, r, 'yt-dlp')
  const file = r.out.trim().split('\n').filter(Boolean).pop() ?? ''
  const name = file.split('/').pop() ?? 'video.mp4'
  const mime = req.mode === 'audio' ? (req.audioFormat === 'mp3' ? 'audio/mpeg' : 'audio/mp4') : 'video/mp4'
  const pub = await engine.publish({ path: file, name, mime })
  patch(id, { uri: pub.uri, file, mime })
  if (req.prepare && req.mode === 'video') {
    await runPrepare(id, file, req.prepare, name, 70)
    return
  }
  patch(id, { status: 'done', percent: 100, stage: t('Concluído') })
}

async function textFileFor(s: ExportSettings, dir: string): Promise<string | null> {
  const txt = s.overlay?.text?.trim()
  if (!txt || !isNative) return txt ? '/demo/texto.txt' : null
  // O texto vai num arquivo para acentos e dois-pontos não precisarem de escape
  const path = `${dir}/texto-${uid()}.txt`
  await engine.writeText({ path, text: txt })
  return path
}

async function runPrepare(id: string, input: string, s: ExportSettings, title: string, from = 0): Promise<void> {
  const { cache } = await engine.dirs()
  const info = await engine.probe({ path: input })
  const base = (title.replace(/\.[^.]+$/, '') || 'video').replace(/[\\/:*?"<>|]/g, '_')
  const out = `${cache}/out/${base}.${s.suffix || 'editado'}.mp4`
  const enc = s.encoder || 'libx264'
  const e = enhanceOf(s)
  let src = input
  let srcInfo: ProbeInfo = info
  let settings = s
  const aiSpan = (e.upscaler !== 'none' ? 1 : 0) + (s.method === 'ai' && s.fps ? 1 : 0)
  const slice = (100 - from) / (aiSpan + 1)
  let at = from

  // 1) Melhorar imagem com IA (Real-ESRGAN 2x): quadros → IA → vídeo intermediário já no tamanho final
  if (e.upscaler !== 'none') {
    const mid = `${cache}/tmp/${id}-ia.mp4`
    await aiUpscale(id, src, srcInfo, settings, mid, enc, at, at + slice)
    at += slice
    src = mid
    srcInfo = await engine.probe({ path: mid })
    // O resto já não corta nem muda de tamanho
    settings = { ...settings, width: 0, height: 0, framing: 'crop', zoom: 1, start: '', end: '', enhance: { ...e, upscaler: 'none' } }
  }

  // 2) Quadros novos com IA (RIFE): quadros no tamanho final → IA → vídeo no FPS final, com o som
  if (settings.method === 'ai' && settings.fps && settings.fps > (srcInfo.fps || 30) * (settings.speed || 1) * 1.001) {
    await aiFrames(id, src, srcInfo, settings, out, enc, at, 100)
  } else {
    const text = await textFileFor(settings, `${cache}/tmp/${id}-texto`)
    const plan = planPrepare(src, out, srcInfo, settings, text, enc)
    const r = await step(id, at, 98, plan.outDur, t('Preparando: {name}', { name: t(s.name) }), (run) => engine.ffmpeg({ id: run, args: plan.args, duration: plan.outDur }))
    if (canceledJobs.has(id)) return void patch(id, { status: 'canceled', stage: t('Cancelado') })
    check(id, r, 'ffmpeg')
  }
  const pub = await engine.publish({ path: out, name: out.split('/').pop()!, mime: 'video/mp4' })
  patch(id, { status: 'done', percent: 100, stage: t('Concluído'), uri: pub.uri, file: out, mime: 'video/mp4' })
}

/** Real-ESRGAN em pedaços de 60 quadros (o celular tem pouco espaço e memória) */
async function aiUpscale(id: string, input: string, info: ProbeInfo, s: ExportSettings, out: string, enc: string, from: number, to: number): Promise<void> {
  const { cache } = await engine.dirs()
  const start = Math.max(0, parseTime(s.start) ?? 0)
  const end = Math.min(info.duration, parseTime(s.end) ?? info.duration)
  const S = info.fps || 30
  const geo = geometry(info, s)
  const pre = geo.crop ? `crop=${geo.crop.w}:${geo.crop.h}:${geo.crop.x}:${geo.crop.y},` : ''
  const W = geo.W
  const H = geo.H
  const total = Math.max(1, Math.round((end - start) * S))
  const per = 60
  const chunks = Math.ceil(total / per)
  const parts: string[] = []
  for (let c = 0; c < chunks; c++) {
    const inDir = `${cache}/tmp/${id}-in`
    const upDir = `${cache}/tmp/${id}-up`
    const k0 = c * per
    const n = Math.min(per, total - k0)
    const ss = start + k0 / S
    const span = (to - from) / chunks
    const f0 = from + c * span
    await engine.remove({ path: inDir })
    await engine.remove({ path: upDir })
    const ex = await step(id, f0, f0 + span * 0.1, 0, t('IA (Real-ESRGAN): pedaço {n} de {total}', { n: c + 1, total: chunks }), (run) =>
      engine.ffmpeg({ id: run, args: ['-hide_banner', '-v', 'error', '-y', '-ss', ss.toFixed(3), '-i', input, '-vf', `${pre}fps=${S}`, '-frames:v', String(n), '-start_number', '1', `${inDir}/%08d.png`], duration: 0 })
    )
    check(id, ex, 'ffmpeg')
    const ai = await step(id, f0 + span * 0.1, f0 + span * 0.85, 0, t('IA (Real-ESRGAN): pedaço {n} de {total}', { n: c + 1, total: chunks }), (run) =>
      engine.ai({ id: run, kind: 'esrgan', model: modelDir('esrgan'), inDir, outDir: upDir, scale: 2 })
    )
    check(id, ai, 'Real-ESRGAN')
    const part = `${cache}/tmp/${id}-p${String(c).padStart(4, '0')}.mp4`
    const en = await step(id, f0 + span * 0.85, f0 + span, 0, t('Gravando o pedaço {n}', { n: c + 1 }), (run) =>
      engine.ffmpeg({ id: run, args: ['-hide_banner', '-v', 'error', '-y', '-framerate', String(S), '-start_number', '1', '-i', `${upDir}/%08d.png`, '-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`, ...encoderArgs(enc, 14), '-an', part], duration: 0 })
    )
    check(id, en, 'ffmpeg')
    parts.push(part)
  }
  await joinParts(id, parts, input, start, end - start, out, info.hasAudio)
}

/** RIFE: cria os quadros que faltam para chegar no FPS final; pedaços com 1 quadro de sobra para ligar um ao outro */
async function aiFrames(id: string, input: string, info: ProbeInfo, s: ExportSettings, out: string, enc: string, from: number, to: number): Promise<void> {
  const { cache } = await engine.dirs()
  const start = Math.max(0, parseTime(s.start) ?? 0)
  const end = Math.min(info.duration, parseTime(s.end) ?? info.duration)
  const S = info.fps || 30
  const speed = s.speed > 0 ? s.speed : 1
  const target = s.fps
  const ratio = target / (S * speed)
  const geo = geometry(info, s)
  const total = Math.max(1, Math.round((end - start) * S))
  const per = 45
  const chunks = Math.ceil(total / per)
  const parts: string[] = []
  for (let c = 0; c < chunks; c++) {
    const inDir = `${cache}/tmp/${id}-in`
    const outDir = `${cache}/tmp/${id}-out`
    const k0 = c * per
    const last = c === chunks - 1
    const n = Math.min(per, total - k0)
    const want = last ? n : n + 1
    const ss = start + k0 / S
    const span = (to - from) / chunks
    const f0 = from + c * span
    await engine.remove({ path: inDir })
    await engine.remove({ path: outDir })
    const ex = await step(id, f0, f0 + span * 0.1, 0, t('IA (RIFE): pedaço {n} de {total}', { n: c + 1, total: chunks }), (run) =>
      engine.ffmpeg({ id: run, args: ['-hide_banner', '-v', 'error', '-y', '-ss', ss.toFixed(3), '-i', input, '-vf', `${geo.filter},fps=${S}`, '-frames:v', String(want), '-start_number', '1', `${inDir}/%08d.png`], duration: 0 })
    )
    check(id, ex, 'ffmpeg')
    const nOut = Math.max(want + 1, Math.round(want * ratio))
    const keep = last ? nOut : Math.round(n * ratio)
    const ai = await step(id, f0 + span * 0.1, f0 + span * 0.85, 0, t('IA (RIFE): pedaço {n} de {total}', { n: c + 1, total: chunks }), (run) =>
      engine.ai({ id: run, kind: 'rife', model: modelDir('rife'), inDir, outDir, frames: nOut })
    )
    check(id, ai, 'RIFE')
    const part = `${cache}/tmp/${id}-p${String(c).padStart(4, '0')}.mp4`
    const rate = (keep * S * speed) / n
    const en = await step(id, f0 + span * 0.85, f0 + span, 0, t('Gravando o pedaço {n}', { n: c + 1 }), (run) =>
      engine.ffmpeg({ id: run, args: ['-hide_banner', '-v', 'error', '-y', '-framerate', rate.toFixed(6), '-start_number', '1', '-i', `${outDir}/%08d.png`, '-frames:v', String(keep), '-vf', `fps=${target},format=yuv420p`, ...encoderArgs(enc, s.quality), '-an', part], duration: 0 })
    )
    check(id, en, 'ffmpeg')
    parts.push(part)
  }
  await joinParts(id, parts, input, start, end - start, out, info.hasAudio && s.audio, speed, s.audioKbps)
}

/** Junta os pedaços (sem codificar de novo) e põe o som do trecho */
async function joinParts(id: string, parts: string[], input: string, start: number, dur: number, out: string, audio: boolean, speed = 1, kbps = 192): Promise<void> {
  const { cache } = await engine.dirs()
  const list = `${cache}/tmp/${id}-lista.txt`
  await engine.writeText({ path: list, text: parts.map((p) => `file '${p}'`).join('\n') })
  const args = ['-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', list]
  if (audio) args.push('-ss', start.toFixed(3), '-t', dur.toFixed(3), '-i', input)
  args.push('-map', '0:v:0', '-c:v', 'copy')
  if (audio) {
    args.push('-map', '1:a:0')
    if (speed !== 1) args.push('-af', atempo(speed))
    args.push('-c:a', 'aac', '-b:a', `${kbps}k`)
  }
  args.push('-movflags', '+faststart', '-t', (dur / speed).toFixed(3), out)
  const r = await step(id, 98, 99, 0, t('Juntando vídeo e áudio'), (run) => engine.ffmpeg({ id: run, args, duration: 0 }))
  check(id, r, 'ffmpeg')
}
