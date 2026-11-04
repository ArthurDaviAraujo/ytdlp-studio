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
  /** Aviso do Windows quando um download ou preparo termina */
  notifyDone: boolean
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
  /** Melhorar imagem e som; ausente em configurações antigas (= tudo desligado) */
  enhance?: EnhanceSettings
  /** Texto e logo por cima do vídeo; ausente = nada */
  overlay?: OverlaySettings
  /** Legendas automáticas (Whisper); ausente = desligadas */
  subtitles?: SubtitleSettings
  /** Enquadramento inteligente: o corte segue o rosto ou a pessoa (posições medidas na tela) */
  track?: TrackPath | null
}

/** Modelos do Whisper: base (rápido), small (melhor), turbo (o melhor, mais lento) */
export type WhisperModel = 'base' | 'small' | 'turbo'

export interface SubtitleSettings {
  on: boolean
  model: WhisperModel
  /** 'auto' ou o código do idioma falado (pt, en, es…) */
  language: string
  /** Traduz para o inglês (o Whisper só traduz para o inglês) */
  translate: boolean
  /** tiktok: poucas palavras por vez com a palavra falada em destaque; classic: frase inteira; none: só o arquivo .srt */
  style: 'tiktok' | 'classic' | 'none'
  position: 'bottom' | 'middle' | 'top'
  /** Altura da letra em % da altura do vídeo */
  size: number
  /** Cor do destaque (tiktok) */
  color: string
  upper: boolean
  /** Palavras por vez no estilo tiktok */
  words: number
  /** Salva também um .srt ao lado do vídeo */
  srt: boolean
}

/** Posição do centro do corte ao longo do tempo (0–100 da largura e da altura do vídeo original) */
export interface TrackPath {
  /** Para qual vídeo e trecho as posições valem */
  key: string
  points: { t: number; x: number; y: number }[]
}

/** Pacote que o app baixa sob demanda (IAs e modelos) */
export interface PackInfo {
  id: string
  name: string
  size: number
  installed: boolean
}

/** Posição na tela: t/m/b (topo, meio, base) + l/c/r (esquerda, centro, direita) */
export type ScreenPos = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br'

export interface OverlaySettings {
  text: string
  textPos: ScreenPos
  /** Altura da letra em % da altura do vídeo */
  textSize: number
  textColor: string
  /** Faixa escura atrás do texto (senão, contorno preto) */
  textBox: boolean
  /** Caminho da imagem do logo ('' = sem logo) */
  logo: string
  logoPos: ScreenPos
  /** Largura do logo em % da largura do vídeo */
  logoSize: number
  /** 0–100 */
  logoOpacity: number
}

/** Ampliar com IA: Real-ESRGAN (vídeo real e anime) ou Real-CUGAN (anime) */
export type Upscaler = 'none' | 'esrgan' | 'cugan'

export interface EnhanceSettings {
  upscaler: Upscaler
  esrganModel: 'realesr-animevideov3' | 'realesrgan-x4plus' | 'realesrgan-x4plus-anime'
  cuganModel: 'se' | 'pro' | 'nose'
  /** 0 = automático (o menor fator que chega ao tamanho final) */
  upScale: number
  /** Real-CUGAN: -1 conservador, 0 sem redução de ruído, 1 a 3 mais forte */
  cuganNoise: number
  upTta: boolean
  /** Tamanho do bloco na placa; 0 = automático. Menor usa menos memória de vídeo */
  upTile: number
  /** 0–100: quanto da imagem da IA entra (o resto é o original ampliado) */
  upBlend: number
  deinterlace: boolean
  /** 0–10 */
  denoise: number
  denoiseMethod: 'fast' | 'quality'
  /** 0–10: tira os quadradinhos da compressão */
  deblock: number
  deband: boolean
  /** 0–10 */
  sharpen: number
  sharpenMethod: 'cas' | 'unsharp'
  /** −100 a 100 */
  brightness: number
  contrast: number
  saturation: number
  vibrance: number
  /** Clareia (+) ou escurece (−) os tons médios */
  gamma: number
  /** −100 (mais frio) a 100 (mais quente) */
  warmth: number
  autoLight: boolean
  stabilize: 'off' | 'light' | 'strong'
  /** Corta sozinho as bordas pretas fixas (vídeo antigo, print de tela) */
  autoCrop: boolean
  deflicker: boolean
  /** 0–10: granulado de filme */
  grain: number
  /** 0–10 */
  audioDenoise: number
  /** Corta ronco e vento (abaixo de 80 Hz) */
  audioCut: boolean
  /** normalize: volume padrão das redes (−14 LUFS); even: também iguala partes baixas e altas */
  audioLevel: 'off' | 'normalize' | 'even'
  /** Separa voz e música com IA para mudar o volume de cada uma */
  separate: boolean
  /** Volume da voz e da música depois de separar, em % (100 = como estava) */
  voice: number
  music: number
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
  /** H.264, H.265 e AV1 que funcionam nesta máquina (para o preparo) */
  allEncoders: string[]
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
  /** Programas de ampliar com IA (pasta realesrgan e realcugan) */
  upscalers: { esrgan: string | null; cugan: string | null }
  /** whisper-cli.exe (legendas) e os modelos que já estão no PC */
  whisper: { exe: string | null; models: WhisperModel[] }
  /** Modelo de separar voz e música (ONNX), se já foi baixado */
  separator: string | null
}

/** Antes e depois de um quadro, para a prévia da melhoria */
export interface EnhancePreview {
  ok: boolean
  error: string | null
  before: string | null
  after: string | null
  /** Quanto o quadro "depois" levou para ficar pronto (s) */
  seconds: number
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

export type JobKind = 'download' | 'export' | 'cut'

/** Resultado da medição de tempo de uma exportação */
export interface ExportEstimate {
  ok: boolean
  error: string | null
  canceled?: boolean
  /** Tempo estimado para a exportação inteira (s) */
  seconds: number
  /** Quanto durou o trecho de teste (s) e quanto de vídeo final ele gerou (s) */
  sampleWall: number
  sampleOut: number
}

/** Trecho do vídeo original, em segundos */
export interface Segment {
  start: number
  end: number
}

/** Equalizador de um canal do mixer, em dB (−12 a +12) */
export interface EqSettings {
  /** Ganho antes do volume */
  gain: number
  bass: number
  mid: number
  treble: number
}

/** Uma música de fundo no editor: um clipe numa trilha própria, que pode começar em qualquer ponto do vídeo */
export interface MusicClip {
  id: string
  path: string
  /** Duração do arquivo de música (s), se conhecida */
  fileDuration: number | null
  /** Em que ponto do vídeo final ela começa (s) */
  at: number
  /** De que segundo da música ela começa */
  start: number
  /** Quanto dela tocar (s); null = até a música acabar (ou até o fim do vídeo, se repetir) */
  length: number | null
  /** 0–2 (1 = volume original do arquivo) */
  volume: number
  /** Repete a música se ela acabar antes */
  loop: boolean
  /** Sobe o volume no começo e abaixa no fim */
  fade: boolean
  eq?: EqSettings
}

/** O que foi feito no editor: trechos que ficam (na ordem), som do vídeo e as músicas. Vazio = vídeo inteiro. */
export interface EditPlan {
  segments: Segment[]
  musics: MusicClip[]
  /** Volume do som do próprio vídeo, 0–2 (1 = sem mudança, 0 = mudo) */
  videoVolume?: number
  /** Equalizador do som do vídeo */
  videoEq?: EqSettings
  /** Velocidade do vídeo (1 = normal). As músicas de fundo não mudam de velocidade; `at` delas é no tempo já acelerado */
  speed?: number
}

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
  /** Cortes e música do editor (kind 'cut', ou 'export' vindo do editor) */
  edit?: EditPlan | null
}

export type JobStatus = 'queued' | 'running' | 'converting' | 'done' | 'error' | 'canceled'

export interface Job {
  id: string
  kind: JobKind
  input: string | null
  exportSettings: ExportSettings | null
  edit?: EditPlan | null
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

/** Versão nova do próprio app no GitHub */
export interface AppUpdateCheck {
  current: string
  latest: string | null
  newer: boolean
  /** Link do instalador (.exe) da última versão */
  url: string | null
  size: number
  /** Página da versão (novidades) */
  page: string | null
  error: string | null
}

export interface UpdateResult {
  ok: boolean
  output: string
  version: string | null
}
