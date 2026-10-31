import { app, type WebContents } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { Job, JobRequest } from '../shared/types'
import { baseArgs, getToolStatus } from './tools'
import { getSettings } from './settings'
import { killTree } from './ytdlp'
import { convertToH264, convertedPath, isVideoFile } from './convert'
import { exportVideo, type ExportHooks } from './export'

// Linhas que o yt-dlp imprime para o app; o resto vai para o log
const PROGRESS_ARGS = [
  '--newline',
  '--progress',
  '--no-quiet',
  '--no-simulate',
  '--progress-template',
  'download:YTP|%(info.id)s|%(progress)j',
  '--progress-template',
  'postprocess:YTPP|%(info.id)s|%(progress.postprocessor)s|%(progress.status)s',
  '--print',
  'before_dl:YTV|%(id)s|%(playlist_index|0)s|%(n_entries|0)s|%(duration|0)s|%(title)s',
  '--print',
  'after_move:YTF|%(id)s|%(filepath)s'
]

const PP_NAMES: Record<string, string> = {
  Merger: 'Juntando vídeo e áudio',
  FFmpegMerger: 'Juntando vídeo e áudio',
  ExtractAudio: 'Extraindo áudio',
  FFmpegExtractAudio: 'Extraindo áudio',
  Metadata: 'Gravando metadados',
  FFmpegMetadata: 'Gravando metadados',
  EmbedThumbnail: 'Embutindo miniatura',
  EmbedSubtitle: 'Embutindo legendas',
  FFmpegEmbedSubtitle: 'Embutindo legendas',
  SubtitlesConvertor: 'Convertendo legendas',
  ThumbnailsConvertor: 'Convertendo miniatura',
  VideoConvertor: 'Recodificando vídeo',
  VideoRemuxer: 'Trocando o contêiner',
  SplitChapters: 'Dividindo por capítulos',
  ModifyChapters: 'Removendo trechos',
  SponsorBlock: 'Consultando o SponsorBlock',
  FixupM3u8: 'Corrigindo arquivo',
  FixupM4a: 'Corrigindo arquivo',
  FixupDuplicateMoov: 'Corrigindo arquivo',
  FixupStretched: 'Corrigindo arquivo',
  FixupTimestamp: 'Corrigindo arquivo',
  MoveFiles: 'Movendo para a pasta final',
  MoveFilesAfterDownload: 'Movendo para a pasta final',
  Exec: 'Executando comando'
}

interface Runtime {
  child: ChildProcess | null
  canceled: boolean
  log: string[]
  durations: Map<string, number>
  out: string
  err: string
}

const jobs = new Map<string, Job>()
const runtime = new Map<string, Runtime>()
let sender: WebContents | null = null
const dirty = new Set<string>()
let flushTimer: NodeJS.Timeout | null = null
let saveTimer: NodeJS.Timeout | null = null

const historyFile = () => join(app.getPath('userData'), 'jobs.json')

export function attach(wc: WebContents): void {
  sender = wc
}

function flush(): void {
  flushTimer = null
  if (!sender || sender.isDestroyed()) return dirty.clear()
  const list = [...dirty].map((id) => jobs.get(id)).filter(Boolean)
  dirty.clear()
  sender.send('jobs:update', list)
}

function touch(job: Job, persist = false): void {
  dirty.add(job.id)
  if (!flushTimer) flushTimer = setTimeout(flush, 150)
  if (persist) scheduleSave()
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const list = [...jobs.values()].slice(-300).map((j) => ({ ...j, logTail: [] }))
    try {
      writeFileSync(historyFile(), JSON.stringify(list))
    } catch {
      // sem histórico salvo desta vez
    }
  }, 500)
}

export function loadHistory(): void {
  try {
    if (!existsSync(historyFile())) return
    const list = JSON.parse(readFileSync(historyFile(), 'utf8')) as Job[]
    for (const j of list) {
      j.kind ??= 'download'
      j.input ??= null
      j.exportSettings ??= null
      if (j.status === 'queued' || j.status === 'running' || j.status === 'converting') {
        j.status = 'canceled'
        j.stage = 'Interrompido quando o app foi fechado'
      }
      jobs.set(j.id, j)
    }
  } catch {
    // histórico ilegível: começa vazio
  }
}

export const listJobs = (): Job[] => [...jobs.values()]

export function getJobLog(id: string): string[] {
  return runtime.get(id)?.log ?? ['(o log completo só fica disponível enquanto o app está aberto)']
}

function log(job: Job, rt: Runtime, line: string): void {
  rt.log.push(line)
  if (rt.log.length > 5000) rt.log.splice(0, rt.log.length - 5000)
  job.logTail = rt.log.slice(-3)
}

export function addJob(req: JobRequest): Job {
  const s = getSettings()
  const kind = req.kind ?? 'download'
  const args = kind === 'download' ? ['-P', s.downloadDir, '-o', s.outputTemplate, ...req.args] : []
  const job: Job = {
    id: randomUUID(),
    kind,
    input: req.input ?? null,
    exportSettings: req.exportSettings ?? null,
    url: req.url,
    title: req.title || req.url,
    thumbnail: req.thumbnail,
    label: req.label,
    args,
    command: kind === 'download' ? ['yt-dlp', ...args, req.url] : [],
    convert: req.convert,
    status: 'queued',
    stage: 'Na fila',
    percent: null,
    downloadedBytes: null,
    totalBytes: null,
    speed: null,
    eta: null,
    fragment: null,
    item: null,
    files: [],
    warnings: 0,
    error: null,
    logTail: [],
    createdAt: Date.now(),
    finishedAt: null
  }
  jobs.set(job.id, job)
  touch(job, true)
  pump()
  return job
}

function activeCount(): number {
  return [...jobs.values()].filter((j) => j.status === 'running' || j.status === 'converting').length
}

function pump(): void {
  const limit = getSettings().concurrency
  for (const job of jobs.values()) {
    if (activeCount() >= limit) break
    if (job.status === 'queued') start(job)
  }
}

function resetProgress(job: Job): void {
  job.percent = null
  job.downloadedBytes = null
  job.totalBytes = null
  job.speed = null
  job.eta = null
  job.fragment = null
}

function start(job: Job): void {
  const bin = getToolStatus().ytdlp.path
  const rt: Runtime = { child: null, canceled: false, log: [], durations: new Map(), out: '', err: '' }
  runtime.set(job.id, rt)
  job.status = 'running'
  job.stage = 'Lendo informações do vídeo'
  job.error = null
  job.files = []
  job.warnings = 0
  job.item = null
  resetProgress(job)
  if (job.kind === 'export') {
    job.stage = 'Lendo o vídeo'
    touch(job, true)
    void runExportJob(job, rt)
    return
  }
  if (!bin) return finish(job, rt, -1, 'yt-dlp.exe não encontrado')

  const args = [...baseArgs(), ...PROGRESS_ARGS, ...job.args, '--', job.url]
  log(job, rt, `> yt-dlp ${args.join(' ')}`)
  const child = spawn(bin, args, { windowsHide: true })
  rt.child = child
  child.stdout.on('data', (d: Buffer) => {
    rt.out += d.toString('utf8')
    const lines = rt.out.split(/\r?\n/)
    rt.out = lines.pop() ?? ''
    for (const l of lines) onStdout(job, rt, l)
    touch(job)
  })
  child.stderr.on('data', (d: Buffer) => {
    rt.err += d.toString('utf8')
    const lines = rt.err.split(/\r?\n/)
    rt.err = lines.pop() ?? ''
    for (const l of lines) onStderr(job, rt, l)
    touch(job)
  })
  child.on('error', (e) => finish(job, rt, -1, e.message))
  child.on('close', (code) => {
    if (rt.out) onStdout(job, rt, rt.out)
    if (rt.err) onStderr(job, rt, rt.err)
    rt.child = null
    void afterDownload(job, rt, code ?? -1)
  })
  touch(job, true)
}

function onStdout(job: Job, rt: Runtime, line: string): void {
  if (!line.trim()) return
  if (line.startsWith('YTP|')) {
    const sep = line.indexOf('|', 4)
    try {
      const p = JSON.parse(line.slice(sep + 1))
      const total = p.total_bytes ?? p.total_bytes_estimate ?? null
      job.downloadedBytes = p.downloaded_bytes ?? null
      job.totalBytes = total
      job.speed = p.speed ?? null
      job.eta = p.eta ?? null
      job.percent = total && p.downloaded_bytes != null ? Math.min(100, (p.downloaded_bytes / total) * 100) : null
      job.fragment = p.fragment_index != null && p.fragment_count ? `${p.fragment_index}/${p.fragment_count}` : null
      const fmt = typeof p.filename === 'string' ? p.filename.match(/\.f([\w-]+)\.\w+$/)?.[1] : null
      job.stage = p.status === 'finished' ? 'Download concluído' : fmt ? `Baixando formato ${fmt}` : 'Baixando'
    } catch {
      log(job, rt, line)
    }
    return
  }
  if (line.startsWith('YTPP|')) {
    const [, , pp, status] = line.split('|')
    if (status === 'started') job.stage = PP_NAMES[pp] ?? `Pós-processamento: ${pp}`
    log(job, rt, `[${pp}] ${status}`)
    return
  }
  if (line.startsWith('YTV|')) {
    const parts = line.split('|')
    const [, id, idx, count, duration] = parts
    const title = parts.slice(5).join('|')
    rt.durations.set(id, Number(duration) || 0)
    job.item = Number(count) > 0 ? { index: Number(idx), count: Number(count), title } : null
    if (!job.item && (!job.title || job.title === job.url)) job.title = title
    resetProgress(job)
    job.stage = 'Começando o download'
    log(job, rt, `[app] Item: ${title}`)
    return
  }
  const sleeping = line.match(/^\[download\] Sleeping ([\d.]+) seconds/)
  if (sleeping) job.stage = `Aguardando ${Math.round(Number(sleeping[1]))} s (exigência do site)`
  if (line.startsWith('YTF|')) {
    const sep = line.indexOf('|', 4)
    const id = line.slice(4, sep)
    const file = line.slice(sep + 1)
    job.files.push(file)
    rt.durations.set(file, rt.durations.get(id) ?? 0)
    log(job, rt, `[app] Arquivo final: ${file}`)
    return
  }
  log(job, rt, line)
}

function onStderr(job: Job, rt: Runtime, line: string): void {
  if (!line.trim()) return
  if (line.startsWith('WARNING:')) job.warnings++
  if (line.startsWith('ERROR:')) job.error = line.slice(6).trim()
  log(job, rt, line)
}

function exportHooks(job: Job, rt: Runtime): ExportHooks {
  return {
    progress: (pct, stage) => {
      job.percent = pct
      if (stage) job.stage = stage
      touch(job)
    },
    log: (line) => {
      log(job, rt, line)
      touch(job)
    },
    spawned: (c) => (rt.child = c),
    canceled: () => rt.canceled
  }
}

async function runExportJob(job: Job, rt: Runtime): Promise<void> {
  if (!job.input || !job.exportSettings) return finish(job, rt, -1, 'Exportação sem arquivo ou sem opções')
  const r = await exportVideo(job.input, job.exportSettings, exportHooks(job, rt))
  if (r.ok && r.output) job.files.push(r.output)
  finish(job, rt, r.ok ? 0 : -1, r.ok || rt.canceled ? null : r.error)
}

async function afterDownload(job: Job, rt: Runtime, code: number): Promise<void> {
  if (rt.canceled) return finish(job, rt, code, null)
  const videos = job.files.filter((f) => isVideoFile(f) && existsSync(f))
  if (job.convert && videos.length) {
    job.status = 'converting'
    for (let i = 0; i < videos.length; i++) {
      if (rt.canceled) break
      const input = videos[i]
      resetProgress(job)
      job.stage = `Convertendo para H.264 (${job.convert.encoder})${videos.length > 1 ? ` ${i + 1}/${videos.length}` : ''}`
      touch(job)
      log(job, rt, `[app] Convertendo ${input}`)
      const r = await convertToH264(
        input,
        job.convert.encoder,
        rt.durations.get(input) || null,
        (pct, line) => {
          if (pct != null) job.percent = pct
          if (line) log(job, rt, line)
          touch(job)
        },
        (c) => (rt.child = c)
      )
      rt.child = null
      if (rt.canceled) break
      if (!r.ok) {
        job.error = `Falha na conversão: ${r.error}`
        continue
      }
      job.files.push(r.output)
      if (!job.convert.keepOriginal) {
        try {
          unlinkSync(input)
          job.files = job.files.filter((f) => f !== input)
        } catch (e) {
          log(job, rt, `[app] Não consegui apagar o original: ${(e as Error).message}`)
        }
      }
    }
  }
  if (job.exportSettings && videos.length && !rt.canceled) {
    job.status = 'converting'
    // Se a conversão apagou o original, prepara a partir do arquivo convertido
    const inputs = videos.map((v) => (existsSync(v) ? v : convertedPath(v))).filter((v) => existsSync(v))
    for (const input of inputs) {
      if (rt.canceled) break
      resetProgress(job)
      const r = await exportVideo(input, job.exportSettings, exportHooks(job, rt))
      if (rt.canceled) break
      if (r.ok && r.output) job.files.push(r.output)
      else job.error = `Falha ao preparar para ${job.exportSettings.name}: ${r.error}`
    }
  }
  finish(job, rt, code, null)
}

function finish(job: Job, rt: Runtime, code: number, error: string | null): void {
  if (error) {
    job.error = error
    log(job, rt, `ERROR: ${error}`)
  }
  resetProgress(job)
  job.finishedAt = Date.now()
  if (rt.canceled) {
    job.status = 'canceled'
    job.stage = 'Cancelado'
  } else if (code === 0 && !job.error) {
    job.status = 'done'
    job.percent = 100
    job.stage = job.files.length ? 'Concluído' : 'Concluído (nenhum arquivo novo)'
  } else if (job.files.length) {
    job.status = 'done'
    job.percent = 100
    job.stage = 'Concluído com erros'
  } else {
    job.status = 'error'
    job.stage = 'Erro'
    job.error = job.error ?? `O yt-dlp terminou com código ${code}`
  }
  touch(job, true)
  pump()
}

export function cancelJob(id: string): void {
  const job = jobs.get(id)
  const rt = runtime.get(id)
  if (!job) return
  if (job.status === 'queued') {
    job.status = 'canceled'
    job.stage = 'Cancelado'
    job.finishedAt = Date.now()
    touch(job, true)
    return
  }
  // A exportação tem várias etapas; marcar como cancelado faz a próxima etapa nem começar
  if (rt) {
    rt.canceled = true
    if (rt.child) killTree(rt.child)
  }
}

export function retryJob(id: string): void {
  const job = jobs.get(id)
  if (!job || job.status === 'running' || job.status === 'converting') return
  job.status = 'queued'
  job.stage = 'Na fila'
  job.error = null
  job.finishedAt = null
  resetProgress(job)
  touch(job, true)
  pump()
}

export function removeJob(id: string): string[] {
  const job = jobs.get(id)
  if (!job) return []
  if (job.status === 'running' || job.status === 'converting') cancelJob(id)
  jobs.delete(id)
  runtime.delete(id)
  scheduleSave()
  return [id]
}

export function clearFinished(): string[] {
  const removed: string[] = []
  for (const j of [...jobs.values()]) {
    if (j.status === 'done' || j.status === 'error' || j.status === 'canceled') {
      jobs.delete(j.id)
      runtime.delete(j.id)
      removed.push(j.id)
    }
  }
  scheduleSave()
  return removed
}

export function cancelAll(): void {
  for (const j of jobs.values()) if (j.status === 'running' || j.status === 'converting') cancelJob(j.id)
}
