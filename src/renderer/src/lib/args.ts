import type { ExportSettings } from '../../../shared/types'
import { BUILTIN_PRESETS } from '../../../shared/presets'

export type Mode = 'video' | 'audio' | 'manual'

export interface AdvancedValue {
  on: boolean
  values: string[][]
}

export type AdvancedState = Record<string, AdvancedValue>

export interface DownloadOptions {
  mode: Mode
  maxHeight: number
  maxFps: number
  vcodec: string
  container: string
  audioFormat: string
  audioQuality: string
  manualVideo: string | null
  manualAudio: string[]
  subsManual: string[]
  subsAuto: string[]
  subFormat: string
  embedSubs: boolean
  writeThumb: boolean
  allThumbs: boolean
  embedThumb: boolean
  thumbFormat: string
  embedMeta: boolean
  embedChapters: boolean
  splitChapters: boolean
  writeDescription: boolean
  writeInfoJson: boolean
  writeComments: boolean
  keepFiles: boolean
  sponsorMode: 'off' | 'mark' | 'remove'
  sponsorCats: string[]
  sections: string[]
  forceKeyframes: boolean
  playlistItems: string
  noPlaylist: boolean
  convertH264: boolean
  convertEncoder: string
  convertKeep: boolean
  exportOn: boolean
  exportSettings: ExportSettings
  presets: string[]
  advanced: AdvancedState
  extraArgs: string
}

export const DEFAULT_OPTIONS: DownloadOptions = {
  mode: 'video',
  maxHeight: 0,
  maxFps: 0,
  vcodec: '',
  container: 'mp4',
  audioFormat: 'mp3',
  audioQuality: '0',
  manualVideo: null,
  manualAudio: [],
  subsManual: [],
  subsAuto: [],
  subFormat: 'srt',
  embedSubs: true,
  writeThumb: false,
  allThumbs: false,
  embedThumb: false,
  thumbFormat: '',
  embedMeta: true,
  embedChapters: true,
  splitChapters: false,
  writeDescription: false,
  writeInfoJson: false,
  writeComments: false,
  keepFiles: false,
  sponsorMode: 'off',
  sponsorCats: ['sponsor'],
  sections: [],
  forceKeyframes: false,
  playlistItems: '',
  noPlaylist: true,
  convertH264: false,
  convertEncoder: '',
  convertKeep: true,
  exportOn: false,
  exportSettings: { ...BUILTIN_PRESETS[0].settings },
  presets: [],
  advanced: {},
  extraArgs: ''
}

/** Campos que valem só para o vídeo analisado e não são lembrados entre vídeos. */
export const PER_VIDEO_KEYS: (keyof DownloadOptions)[] = [
  'manualVideo',
  'manualAudio',
  'subsManual',
  'subsAuto',
  'sections',
  'playlistItems'
]

export const SPONSOR_CATEGORIES: { id: string; label: string }[] = [
  { id: 'sponsor', label: 'Patrocínio' },
  { id: 'intro', label: 'Vinheta de abertura' },
  { id: 'outro', label: 'Encerramento / créditos' },
  { id: 'selfpromo', label: 'Autopromoção' },
  { id: 'preview', label: 'Prévia / recapitulação' },
  { id: 'filler', label: 'Enrolação' },
  { id: 'interaction', label: 'Pedido de like/inscrição' },
  { id: 'music_offtopic', label: 'Música: parte sem música' },
  { id: 'hook', label: 'Gancho / chamariz' }
]

export const AUDIO_FORMATS = ['mp3', 'm4a', 'aac', 'opus', 'vorbis', 'flac', 'alac', 'wav', 'best']

export interface BuildContext {
  isPlaylist: boolean
}

export function buildArgs(o: DownloadOptions, ctx: BuildContext): string[] {
  const a: string[] = []

  if (o.mode === 'audio') {
    a.push('-f', 'ba/b', '-x', '--audio-format', o.audioFormat)
    if (o.audioQuality) a.push('--audio-quality', o.audioQuality)
  } else if (o.mode === 'manual' && !ctx.isPlaylist && (o.manualVideo || o.manualAudio.length)) {
    const ids = [o.manualVideo, ...o.manualAudio].filter(Boolean) as string[]
    a.push('-f', ids.join('+'))
    if (o.manualAudio.length > 1) a.push('--audio-multistreams')
    if (o.container) a.push('--merge-output-format', o.container, '--remux-video', o.container)
  } else {
    a.push('-f', 'bv*+ba/b')
    const sort: string[] = []
    if (o.maxHeight) sort.push(`res:${o.maxHeight}`)
    if (o.maxFps) sort.push(`fps:${o.maxFps}`)
    if (o.vcodec) sort.push(`vcodec:${o.vcodec}`)
    if (o.container === 'mp4') sort.push('ext:mp4:m4a')
    if (o.container === 'webm') sort.push('ext:webm:webm')
    if (sort.length) a.push('-S', sort.join(','))
    if (o.container) a.push('--merge-output-format', o.container, '--remux-video', o.container)
  }

  if (o.subsManual.length) a.push('--write-subs')
  if (o.subsAuto.length) a.push('--write-auto-subs')
  const langs = [...new Set([...o.subsManual, ...o.subsAuto])]
  if (langs.length) {
    a.push('--sub-langs', langs.join(','))
    if (o.subFormat) a.push('--convert-subs', o.subFormat)
    if (o.embedSubs && o.mode !== 'audio') a.push('--embed-subs')
  }

  if (o.allThumbs) a.push('--write-all-thumbnails')
  else if (o.writeThumb) a.push('--write-thumbnail')
  if (o.thumbFormat && (o.writeThumb || o.allThumbs || o.embedThumb)) a.push('--convert-thumbnails', o.thumbFormat)
  if (o.embedThumb) a.push('--embed-thumbnail')

  if (o.embedMeta) a.push('--embed-metadata')
  if (o.embedChapters) a.push('--embed-chapters')
  if (o.splitChapters) a.push('--split-chapters')
  if (o.writeDescription) a.push('--write-description')
  if (o.writeInfoJson || o.writeComments) a.push('--write-info-json')
  if (o.writeComments) a.push('--write-comments')
  if (o.keepFiles) a.push('-k')

  if (o.sponsorMode !== 'off' && o.sponsorCats.length) {
    a.push(o.sponsorMode === 'mark' ? '--sponsorblock-mark' : '--sponsorblock-remove', o.sponsorCats.join(','))
  }

  for (const s of o.sections) a.push('--download-sections', s)
  if (o.sections.length && o.forceKeyframes) a.push('--force-keyframes-at-cuts')

  if (ctx.isPlaylist) {
    a.push('--yes-playlist')
    if (o.playlistItems) a.push('--playlist-items', o.playlistItems)
  } else if (o.noPlaylist) {
    a.push('--no-playlist')
  }

  for (const p of o.presets) a.push('-t', p)

  for (const [flag, v] of Object.entries(o.advanced)) {
    if (!v.on) continue
    if (!v.values.length) {
      a.push(flag)
      continue
    }
    for (const tuple of v.values) {
      if (tuple.every((x) => !x)) continue
      a.push(flag, ...tuple)
    }
  }

  a.push(...splitArgs(o.extraArgs))
  return a
}

export function describe(o: DownloadOptions, ctx: BuildContext): string {
  const parts: string[] = []
  if (o.mode === 'audio') {
    parts.push(`Áudio ${o.audioFormat.toUpperCase()}`)
  } else if (o.mode === 'manual' && !ctx.isPlaylist && (o.manualVideo || o.manualAudio.length)) {
    parts.push(`Formatos ${[o.manualVideo, ...o.manualAudio].filter(Boolean).join('+')}`)
  } else {
    parts.push(o.maxHeight ? `Vídeo até ${o.maxHeight}p` : 'Vídeo na melhor qualidade')
    if (o.vcodec) parts.push(o.vcodec.toUpperCase())
  }
  if (o.mode !== 'audio' && o.container) parts.push(o.container.toUpperCase())
  const subs = new Set([...o.subsManual, ...o.subsAuto]).size
  if (subs) parts.push(`${subs} legenda${subs > 1 ? 's' : ''}`)
  if (o.sections.length) parts.push(`${o.sections.length} trecho${o.sections.length > 1 ? 's' : ''}`)
  if (o.convertH264 && o.mode !== 'audio') parts.push('→ H.264')
  if (o.exportOn && o.mode !== 'audio') parts.push(`→ ${o.exportSettings.name}`)
  return parts.join(' · ')
}

/** Divide uma linha de argumentos como o terminal faria (aspas simples ou duplas agrupam). */
export function splitArgs(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  let has = false
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      has = true
    } else if (/\s/.test(ch)) {
      if (has || cur) out.push(cur)
      cur = ''
      has = false
    } else {
      cur += ch
      has = true
    }
  }
  if (has || cur) out.push(cur)
  return out
}

export function quoteArg(a: string): string {
  if (a === '') return '""'
  return /[\s"'&|<>^%*?()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a
}

export type FormatKind = 'av' | 'v' | 'a' | 'other'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatKind(f: any): FormatKind {
  if (f.format_note === 'storyboard' || f.ext === 'mhtml') return 'other'
  const v = f.vcodec ? f.vcodec !== 'none' : f.resolution !== 'audio only'
  const a = f.acodec ? f.acodec !== 'none' : true
  if (v && a) return 'av'
  if (v) return 'v'
  if (a) return 'a'
  return 'other'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const formatSize = (f: any): number | null => f?.filesize ?? f?.filesize_approx ?? null
