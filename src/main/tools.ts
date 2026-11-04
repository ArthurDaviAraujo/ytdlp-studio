import { app } from 'electron'
import { spawnSync } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { basename, dirname, join } from 'path'
import type { Settings, ToolStatus } from '../shared/types'
import { compareModels } from '../shared/presets'
import { getSettings } from './settings'

function which(name: string): string | null {
  const r = spawnSync('where', [name], { encoding: 'utf8', windowsHide: true })
  if (r.status !== 0) return null
  const first = r.stdout.split(/\r?\n/).find((l) => l.trim())
  return first ? first.trim() : null
}

/** Pasta gravável com cópias dos binários (no app instalado, Program Files não deixa o yt-dlp -U atualizar). */
const userBin = () => join(app.getPath('userData'), 'bin')

export function ensureBundledBinaries(): void {
  if (!app.isPackaged) return
  const src = join(process.resourcesPath, 'bin')
  mkdirSync(userBin(), { recursive: true })
  for (const exe of ['yt-dlp.exe', 'ffmpeg.exe', 'ffprobe.exe']) {
    const from = join(src, exe)
    const to = join(userBin(), exe)
    if (existsSync(from) && !existsSync(to)) copyFileSync(from, to)
  }
}

function searchDirs(): string[] {
  const bundled = [userBin(), join(process.resourcesPath ?? '', 'bin')]
  // Em desenvolvimento o projeto fica em D:\yt-dlp; os programas ficam em D:\yt-dlp\programas
  const parents: string[] = []
  let dir = app.getAppPath()
  for (let i = 0; i < 3; i++) {
    dir = dirname(dir)
    parents.push(join(dir, 'programas'), dir)
  }
  // Sem isso, depois de abrir o app instalado uma vez, o modo dev passaria a usar as cópias do AppData
  return app.isPackaged ? [...bundled, ...parents] : [...parents, ...bundled]
}

function findBinary(configured: string, exe: string): string | null {
  if (configured && existsSync(configured)) return configured
  for (const d of searchDirs()) {
    const p = join(d, exe)
    if (existsSync(p)) return p
  }
  return which(exe)
}

function firstLine(bin: string, args: string[]): string | null {
  const r = spawnSync(bin, args, { encoding: 'utf8', windowsHide: true, timeout: 20000 })
  if (r.status !== 0 || !r.stdout) return null
  return r.stdout.split(/\r?\n/)[0].trim() || null
}

/** Instalações do RIFE: a pasta "rife" (principal) e outras pastas "rife-*" ao lado dela, ex.: "rife-comunidade". */
function rifeEngines(configured: string): string[] {
  const exes: string[] = []
  const add = (p: string) => {
    if (existsSync(p) && !exes.includes(p)) exes.push(p)
  }
  if (configured) add(configured)
  for (const d of searchDirs()) add(join(d, 'rife', 'rife-ncnn-vulkan.exe'))
  for (const d of searchDirs()) {
    try {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory() && /^rife-/i.test(e.name)) add(join(d, e.name, 'rife-ncnn-vulkan.exe'))
      }
    } catch {
      // pasta inexistente ou sem permissão
    }
  }
  return exes
}

function findRife(configured: string): ToolStatus['rife'] {
  const info: ToolStatus['rife']['info'] = {}
  const seen = new Set<string>()
  const exes = rifeEngines(configured)
  exes.forEach((exe, i) => {
    const dir = dirname(exe)
    // A primeira instalação mantém os nomes simples (compatível com predefinições salvas)
    const engine = i === 0 ? '' : basename(dir).replace(/^rife-/i, '')
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || !existsSync(join(dir, e.name, 'flownet.param'))) continue
      // O mesmo modelo nas duas instalações aparece uma vez só, pela primeira
      if (seen.has(e.name)) continue
      seen.add(e.name)
      info[engine ? `${engine}/${e.name}` : e.name] = { dir: join(dir, e.name), exe, engine }
    }
  })
  const models = Object.keys(info).sort((a, b) => compareModels(b, a))
  return { path: exes[0] ?? null, models, info }
}

function resolveJsRuntime(s: Settings): ToolStatus['jsRuntime'] {
  if (s.jsRuntime === 'none') return null
  if (s.jsRuntimePath && existsSync(s.jsRuntimePath)) {
    const name = s.jsRuntime === 'auto' ? (/deno/i.test(s.jsRuntimePath) ? 'deno' : 'node') : s.jsRuntime
    return { name, path: s.jsRuntimePath }
  }
  const order = s.jsRuntime === 'auto' ? ['deno', 'node'] : [s.jsRuntime]
  for (const name of order) {
    // O instalador leva o deno.exe junto, então a pasta dos programas vem antes do PATH
    const bundled = searchDirs().map((d) => join(d, `${name}.exe`)).find((p) => existsSync(p))
    const p = bundled ?? which(name)
    if (p) return { name, path: p }
  }
  return null
}

let cached: ToolStatus | null = null

export function getToolStatus(refresh = false): ToolStatus {
  if (cached && !refresh) return cached
  const s = getSettings()
  const ytdlp = findBinary(s.ytdlpPath, 'yt-dlp.exe')
  const ffmpeg = findBinary(s.ffmpegPath, 'ffmpeg.exe')
  // O yt-dlp recebe a pasta do ffmpeg em --ffmpeg-location e procura o ffprobe nessa mesma pasta
  const probeNext = ffmpeg ? join(dirname(ffmpeg), 'ffprobe.exe') : null
  const ffprobe = probeNext ? (existsSync(probeNext) ? probeNext : null) : which('ffprobe.exe')
  const ffmpegVersion = ffmpeg ? firstLine(ffmpeg, ['-hide_banner', '-version']) : null
  cached = {
    ytdlp: { path: ytdlp, version: ytdlp ? firstLine(ytdlp, ['--version']) : null },
    ffmpeg: { path: ffmpeg, version: ffmpegVersion?.replace(/^ffmpeg version\s+/, '').split(' ')[0] ?? null },
    ffprobe: { path: ffprobe, version: null },
    jsRuntime: resolveJsRuntime(s),
    rife: findRife(s.rifePath),
    upscalers: {
      esrgan: searchDirs().map((d) => join(d, 'realesrgan', 'realesrgan-ncnn-vulkan.exe')).find((p) => existsSync(p)) ?? null,
      cugan: searchDirs().map((d) => join(d, 'realcugan', 'realcugan-ncnn-vulkan.exe')).find((p) => existsSync(p)) ?? null
    }
  }
  return cached
}

/** Argumentos que o app sempre passa ao yt-dlp. */
export function baseArgs(): string[] {
  const t = getToolStatus()
  const args = ['--encoding', 'utf-8', '--color', 'never']
  if (t.ffmpeg.path) args.push('--ffmpeg-location', dirname(t.ffmpeg.path))
  // Passa o caminho sempre: o yt-dlp só acha sozinho o Deno que está no PATH
  if (t.jsRuntime) args.push('--js-runtimes', `${t.jsRuntime.name}:${t.jsRuntime.path}`)
  return args
}
