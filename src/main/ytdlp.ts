import { spawn, type ChildProcess } from 'child_process'
import type { CommentsResult, HelpData, HelpOption, HelpSection, InfoRequest, InfoResult, UpdateCheck, UpdateResult } from '../shared/types'
import { baseArgs, getToolStatus } from './tools'

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

export function killTree(child: ChildProcess): void {
  if (child.pid == null || child.exitCode != null) return
  // O yt-dlp abre o ffmpeg como filho; matar só o processo principal deixaria o ffmpeg rodando
  spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
}

function run(args: string[], env: NodeJS.ProcessEnv = {}, onSpawn?: (c: ChildProcess) => void): Promise<RunResult> {
  const bin = getToolStatus().ytdlp.path
  if (!bin) return Promise.resolve({ code: -1, stdout: '', stderr: 'ERROR: yt-dlp.exe não encontrado. Configure o caminho em Configurações.' })
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true, env: { ...process.env, ...env } })
    onSpawn?.(child)
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (d: Buffer) => out.push(d))
    child.stderr.on('data', (d: Buffer) => err.push(d))
    child.on('error', (e) => resolve({ code: -1, stdout: '', stderr: `ERROR: ${e.message}` }))
    child.on('close', (code) =>
      resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') })
    )
  })
}

const linesOf = (text: string, prefix: string) =>
  text
    .split(/\r?\n/)
    .filter((l) => l.startsWith(prefix))
    .map((l) => l.slice(prefix.length).trim())

function errorText(r: RunResult): string {
  const errors = linesOf(r.stderr, 'ERROR:')
  if (errors.length) return errors.join('\n')
  return r.stderr.trim() || `O yt-dlp terminou com código ${r.code}`
}

let infoChild: ChildProcess | null = null
let infoCanceled = false

export function cancelInfo(): void {
  if (infoChild) {
    infoCanceled = true
    killTree(infoChild)
  }
}

export async function getInfo(req: InfoRequest): Promise<InfoResult> {
  cancelInfo()
  infoCanceled = false
  const args = [...baseArgs(), '-J', '--flat-playlist', req.noPlaylist ? '--no-playlist' : '--yes-playlist', '--', req.url]
  const r = await run(args, {}, (c) => (infoChild = c))
  infoChild = null
  const warnings = linesOf(r.stderr, 'WARNING:')
  if (infoCanceled) return { ok: false, info: null, error: null, warnings, canceled: true }
  if (r.code !== 0 || !r.stdout.trim()) return { ok: false, info: null, error: errorText(r), warnings, canceled: false }
  try {
    return { ok: true, info: JSON.parse(r.stdout), error: null, warnings, canceled: false }
  } catch (e) {
    return { ok: false, info: null, error: `Resposta inválida do yt-dlp: ${(e as Error).message}`, warnings, canceled: false }
  }
}

export async function getComments(url: string, max: number, sort: 'top' | 'new'): Promise<CommentsResult> {
  const args = [
    ...baseArgs(),
    '-J',
    '--skip-download',
    '--no-playlist',
    '--write-comments',
    '--extractor-args',
    `youtube:max_comments=${max},all,all,all;comment_sort=${sort}`,
    '--',
    url
  ]
  const r = await run(args)
  if (r.code !== 0 || !r.stdout.trim()) return { ok: false, comments: [], error: errorText(r) }
  try {
    const info = JSON.parse(r.stdout)
    return { ok: true, comments: info.comments ?? [], error: null }
  } catch (e) {
    return { ok: false, comments: [], error: (e as Error).message }
  }
}

// Opções que o próprio app controla; mexer nelas quebraria a leitura do progresso ou não faz sentido numa interface
const MANAGED: Record<string, string> = {
  '--help': 'Esta tela já é a ajuda',
  '--version': 'Veja em Configurações',
  '--update': 'Use Configurações → Atualizar',
  '--update-to': 'Use Configurações → Atualizar',
  '--dump-json': 'Usada pelo app para ler as informações',
  '--dump-single-json': 'Usada pelo app para ler as informações',
  '--list-formats': 'Veja a aba Formatos',
  '--list-subs': 'Veja a aba Legendas',
  '--list-thumbnails': 'Veja a aba Miniaturas',
  '--list-extractors': 'Só imprime uma lista',
  '--extractor-descriptions': 'Só imprime uma lista',
  '--list-impersonate-targets': 'Só imprime uma lista',
  '--progress-template': 'Usada pelo app para a barra de progresso',
  '--newline': 'Usada pelo app para a barra de progresso',
  '--progress': 'Usada pelo app para a barra de progresso',
  '--no-progress': 'Esconderia a barra de progresso',
  '--quiet': 'Esconderia o log e o progresso',
  '--no-quiet': 'Usada pelo app',
  '--encoding': 'O app força UTF-8 para acentos e outros alfabetos',
  '--color': 'O log do app não mostra cores',
  '--ffmpeg-location': 'Defina em Configurações'
}

export function parseHelp(text: string, version: string): HelpData {
  const sections: HelpSection[] = []
  const presets: HelpData['presets'] = []
  let section: HelpSection | null = null
  let cur: HelpOption | null = null

  for (const line of text.split(/\r?\n/)) {
    if (/^ {2}\S.*:\s*$/.test(line)) {
      section = { title: line.trim().slice(0, -1), note: '', options: [] }
      sections.push(section)
      cur = null
      continue
    }
    if (!section) continue

    if (section.title === 'Preset Aliases') {
      const m = line.match(/^ {4}-t (\S+)\s{2,}(.+)$/)
      if (m) presets.push({ name: m[1], expands: m[2].trim() })
      else if (/^ {4}\S/.test(line)) section.note += line.trim()
      continue
    }

    const opt = line.match(/^ {4}(-\S.*?)(?:\s{2,}(.*))?$/)
    if (opt) {
      const parts = opt[1].trim().split(', ')
      const flags: string[] = []
      let metavars: string[] = []
      parts.forEach((p, i) => {
        const toks = p.split(' ')
        flags.push(toks[0])
        if (i === parts.length - 1) metavars = toks.slice(1)
      })
      const key = flags.find((f) => f.startsWith('--')) ?? flags[0]
      cur = { key, flags, metavars, description: (opt[2] ?? '').trim(), repeatable: false, managed: MANAGED[key] ?? null }
      section.options.push(cur)
    } else if (/^ {5,}\S/.test(line) && cur) {
      cur.description += ' ' + line.trim()
    } else if (/^ {4}\S/.test(line)) {
      section.note += line.trim()
    }
  }
  for (const s of sections) for (const o of s.options) o.repeatable = /multiple times/i.test(o.description)
  return { version, sections: sections.filter((s) => s.options.length || s.title === 'Preset Aliases'), presets }
}

let helpCache: { key: string; data: HelpData } | null = null

export async function getHelp(): Promise<HelpData> {
  const t = getToolStatus()
  const key = `${t.ytdlp.path}|${t.ytdlp.version}`
  if (helpCache?.key === key) return helpCache.data
  // Terminal "largo" para cada opção vir numa linha só
  const r = await run(['--help'], { COLUMNS: '1000' })
  const data = parseHelp(r.stdout, t.ytdlp.version ?? '')
  helpCache = { key, data }
  return data
}

/** "2026.10.21" < "2026.10.30" < "2026.10.30.1" */
function newerThan(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0
  }
  return false
}

/** Consulta a última versão estável no GitHub do yt-dlp. */
export async function checkYtdlpUpdate(): Promise<UpdateCheck> {
  const current = getToolStatus().ytdlp.version
  try {
    const r = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
      headers: { 'User-Agent': 'yt-dlp-gui', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000)
    })
    if (!r.ok) return { current, latest: null, newer: false, error: `GitHub respondeu ${r.status}` }
    const latest = String(((await r.json()) as { tag_name?: string }).tag_name ?? '') || null
    return { current, latest, newer: !!(latest && current && newerThan(latest, current)), error: null }
  } catch (e) {
    return { current, latest: null, newer: false, error: (e as Error).message }
  }
}

export async function updateYtdlp(channel: string): Promise<UpdateResult> {
  const args = channel === 'stable' ? ['-U'] : ['--update-to', channel]
  const r = await run(args)
  const status = getToolStatus(true)
  helpCache = null
  return { ok: r.code === 0, output: (r.stdout + '\n' + r.stderr).trim(), version: status.ytdlp.version }
}
