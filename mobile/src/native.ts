import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/**
 * Ponte com o lado Android (Kotlin): yt-dlp e ffmpeg da biblioteca youtubedl-android, IA pelo ncnn (Vulkan),
 * arquivos pela galeria (MediaStore). No navegador (demonstração) tudo é simulado.
 */

export interface RunResult {
  code: number
  out: string
  err: string
}

export interface EngineStatus {
  ytdlp: string | null
  ffmpeg: boolean
  /** Placa do celular aceita Vulkan (as IAs precisam) */
  vulkan: boolean
  gpu: string | null
  /** Arquitetura do celular (arm64-v8a, x86_64…), para o aviso de versão nova escolher o APK certo */
  abi?: string | null
}

export interface ProbeInfo {
  width: number
  height: number
  fps: number
  duration: number
  hasAudio: boolean
}

interface EnginePlugin {
  init(): Promise<EngineStatus>
  ytdlp(o: { id: string; args: string[] }): Promise<RunResult>
  ffmpeg(o: { id: string; args: string[]; duration: number }): Promise<RunResult>
  cancel(o: { id: string }): Promise<void>
  probe(o: { path: string }): Promise<ProbeInfo>
  frame(o: { path: string; time: number; width: number }): Promise<{ data: string | null }>
  pickVideo(): Promise<{ path: string | null; name: string | null }>
  publish(o: { path: string; name: string; mime: string }): Promise<{ uri: string }>
  open(o: { uri: string; mime: string }): Promise<void>
  share(o: { uri: string; mime: string }): Promise<void>
  /** Abre um link no navegador do celular */
  openUrl(o: { url: string }): Promise<void>
  /** `base` e `whole`: para um pacote de vários arquivos, o progresso vai de 0 a 100 no pacote todo */
  fetchFile(o: { id: string; url: string; path: string; size: number; base?: number; whole?: number }): Promise<{ ok: boolean; error: string | null }>
  exists(o: { path: string }): Promise<{ exists: boolean }>
  /** Com `prefix`, apaga só os itens da pasta que começam com ele */
  remove(o: { path: string; prefix?: string }): Promise<void>
  writeText(o: { path: string; text: string }): Promise<void>
  dirs(): Promise<{ files: string; cache: string }>
  ai(o: { id: string; kind: 'rife' | 'esrgan'; model: string; inDir: string; outDir: string; frames?: number; scale?: number }): Promise<RunResult>
  updateYtdlp(): Promise<{ status: string; version: string | null }>
  takeShared(): Promise<{ url: string | null }>
  addListener(event: 'progress', cb: (e: { id: string; percent: number | null; line: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'shared', cb: (e: { url: string }) => void): Promise<PluginListenerHandle>
}

export const isNative = Capacitor.isNativePlatform()
const real = isNative ? registerPlugin<EnginePlugin>('Engine') : null

// ---------- Demonstração no navegador: respostas de mentira, com progresso que anda ----------

const listeners: ((e: { id: string; percent: number | null; line: string }) => void)[] = []
const canceled = new Set<string>()
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fakeRun(id: string, seconds: number, lines: (p: number) => string): Promise<RunResult> {
  const steps = Math.round(seconds * 10)
  for (let i = 0; i <= steps; i++) {
    if (canceled.has(id)) return { code: 1, out: '', err: 'Cancelado' }
    const p = (i / steps) * 100
    listeners.forEach((l) => l({ id, percent: p, line: lines(p) }))
    await wait(100)
  }
  return { code: 0, out: '', err: '' }
}

const demoInfo = {
  id: 'jNQXAC9IVRw',
  title: 'Me at the zoo',
  uploader: 'jawed',
  duration: 19,
  thumbnail: 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg',
  webpage_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  formats: [
    { format_id: '18', height: 360, fps: 30, vcodec: 'avc1', acodec: 'mp4a', ext: 'mp4', filesize: 791459 },
    { format_id: '134', height: 360, fps: 30, vcodec: 'avc1', acodec: 'none', ext: 'mp4', filesize: 512000 },
    { format_id: '133', height: 240, fps: 30, vcodec: 'avc1', acodec: 'none', ext: 'mp4', filesize: 260000 },
    { format_id: '140', height: null, fps: null, vcodec: 'none', acodec: 'mp4a', ext: 'm4a', filesize: 300000 }
  ]
}

const demo: EnginePlugin = {
  init: async () => ({ ytdlp: '2026.10.26', ffmpeg: true, vulkan: true, gpu: 'Adreno 740 (demonstração)', abi: 'arm64-v8a' }),
  ytdlp: async ({ id, args }) => {
    if (args.includes('-J')) {
      await wait(900)
      return { code: 0, out: JSON.stringify(demoInfo), err: '' }
    }
    const r = await fakeRun(id, 4, (p) => `[download] ${p.toFixed(1)}% of 2.10MiB at 1.20MiB/s ETA 00:0${Math.max(0, Math.round((100 - p) / 25))}`)
    return { ...r, out: '/demo/Me at the zoo [jNQXAC9IVRw].mp4' }
  },
  ffmpeg: async ({ id }) => fakeRun(id, 5, (p) => `out_time_us=${Math.round(p * 190000)}`),
  cancel: async ({ id }) => void canceled.add(id),
  probe: async () => ({ width: 1280, height: 720, fps: 30, duration: 19, hasAudio: true }),
  frame: async () => ({ data: demoInfo.thumbnail }),
  pickVideo: async () => ({ path: '/demo/viagem.mp4', name: 'viagem.mp4' }),
  publish: async ({ name }) => ({ uri: 'content://demo/' + name }),
  open: async () => {},
  share: async () => {},
  openUrl: async ({ url }) => void window.open(url, '_blank'),
  fetchFile: async ({ id }) => {
    await fakeRun(id, 3, () => '')
    demoFiles.add(id)
    return { ok: true, error: null }
  },
  exists: async ({ path }) => ({ exists: [...demoFiles].some((f) => path.includes('/' + f.replace('pack-', '') + '/')) }),
  remove: async () => {},
  writeText: async () => {},
  dirs: async () => ({ files: '/demo/files', cache: '/demo/cache' }),
  ai: async ({ id }) => fakeRun(id, 6, () => ''),
  updateYtdlp: async () => {
    await wait(1500)
    return { status: 'ALREADY_UP_TO_DATE', version: '2026.10.26' }
  },
  takeShared: async () => ({ url: null }),
  addListener: (async (_e: string, cb: (e: { id: string; percent: number | null; line: string }) => void) => {
    listeners.push(cb)
    return { remove: async () => void listeners.splice(listeners.indexOf(cb), 1) }
  }) as EnginePlugin['addListener']
}
const demoFiles = new Set<string>()

export const engine: EnginePlugin = real ?? demo
