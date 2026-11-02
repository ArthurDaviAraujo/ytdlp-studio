import type { Lang } from './i18n'

export type JsRuntimeChoice = 'auto' | 'none' | 'deno' | 'node'

export interface Settings {
  ytdlpPath: string
  ffmpegPath: string
  rifePath: string
  jsRuntime: JsRuntimeChoice
  jsRuntimePath: string
  downloadDir: string
  outputTemplate: string
  concurrency: number
  exportPresets: SavedPreset[]
  checkUpdates: boolean
  language: Lang
}

export type Framing = 'crop' | 'blur' | 'bars'

/** Como criar quadros novos quando o FPS final é maior que o do vídeo. */
export type FrameMethod = 'duplicate' | 'gpu' | 'cpu' | 'ai'

export interface ExportSettings {
  name: string
  suffix: string
  /** 0 = manter o tamanho original */
  width: number
  height: number
  framing: Framing
  /** 0 a 100: posição horizontal do corte (esquerda → direita) */
  position: number
  /** 0 a 100: posição vertical do corte (topo → base) */
  positionY: number
  /** 1 = o maior recorte que cabe; acima de 1 aproxima e libera mover em todas as direções */
  zoom: number
  blur: number
  barColor: string
  /** 0 = manter o FPS original */
  fps: number
  method: FrameMethod
  aiModel: string
  aiUhd: boolean
  aiTtaSpatial: boolean
  aiTtaTemporal: boolean
  /** Placa de vídeo do RIFE (índice da Vulkan); -1 = o RIFE escolhe */
  aiGpu: number
  speed: number
  start: string
  end: string
  /** Só para avisar; 0 = sem limite */
  maxDuration: number
  encoder: string
  quality: number
  maxBitrate: number
  audio: boolean
  audioKbps: number
}

export interface SavedPreset {
  id: string
  settings: ExportSettings
}

export interface MediaInfo {
  path: string
  width: number
  height: number
  fps: number
  duration: number
  hasAudio: boolean
  vcodec: string
  acodec: string
  size: number
}

export interface Capabilities {
  encoders: string[]
  frcAmf: boolean
  /** Placas de vídeo que o RIFE enxerga pela Vulkan (AMD, NVIDIA ou Intel) */
  gpus: { id: number; name: string }[]
}

export interface ToolInfo {
  path: string | null
  version: string | null
}

export interface ToolStatus {
  ytdlp: ToolInfo
  ffmpeg: ToolInfo
  ffprobe: ToolInfo
  jsRuntime: { name: string; path: string } | null
  /** models: ids na ordem do mais novo para o mais antigo; info diz de qual instalação cada um vem */
  rife: { path: string | null; models: string[]; info: Record<string, RifeModelInfo> }
}

export interface RifeModelInfo {
  dir: string
  exe: string
  /** '' = instalação principal (pasta rife); senão o nome da outra pasta, ex.: "comunidade" */
  engine: string
}

export interface InfoRequest {
  url: string
  noPlaylist: boolean
}

export interface InfoResult {
  ok: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: any | null
  error: string | null
  warnings: string[]
  canceled: boolean
}

export interface YtComment {
  id: string
  parent: string
  text: string
  author: string
  author_thumbnail?: string
  author_is_uploader?: boolean
  author_is_verified?: boolean
  like_count?: number
  is_pinned?: boolean
  is_favorited?: boolean
  timestamp?: number
  _time_text?: string
}

export interface CommentsResult {
  ok: boolean
  comments: YtComment[]
  error: string | null
}

export interface HelpOption {
  key: string
  flags: string[]
  metavars: string[]
  description: string
  repeatable: boolean
  managed: string | null
}

export interface HelpSection {
  title: string
  note: string
  options: HelpOption[]
}

export interface HelpPreset {
  name: string
  expands: string
}

export interface HelpData {
  version: string
  sections: HelpSection[]
  presets: HelpPreset[]
}

export interface ConvertOptions {
  encoder: string
  keepOriginal: boolean
}

export type JobKind = 'download' | 'export'

export interface JobRequest {
  kind?: JobKind
  url: string
  title: string
  thumbnail: string | null
  label: string
  args: string[]
  convert: ConvertOptions | null
  /** Depois do download, prepara cada vídeo com estas opções */
  exportSettings?: ExportSettings | null
  /** Exportação de um arquivo que já está no PC */
  input?: string | null
}

export type JobStatus = 'queued' | 'running' | 'converting' | 'done' | 'error' | 'canceled'

export interface Job {
  id: string
  kind: JobKind
  input: string | null
  exportSettings: ExportSettings | null
  url: string
  title: string
  thumbnail: string | null
  label: string
  args: string[]
  command: string[]
  convert: ConvertOptions | null
  status: JobStatus
  stage: string
  percent: number | null
  downloadedBytes: number | null
  totalBytes: number | null
  speed: number | null
  eta: number | null
  fragment: string | null
  item: { index: number; count: number; title: string } | null
  files: string[]
  warnings: number
  error: string | null
  logTail: string[]
  createdAt: number
  finishedAt: number | null
}

export interface UpdateCheck {
  current: string | null
  latest: string | null
  newer: boolean
  error: string | null
}

export interface UpdateResult {
  ok: boolean
  output: string
  version: string | null
}
