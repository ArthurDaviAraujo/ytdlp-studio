import type { ExportSettings, SubtitleSettings } from './types'

export const NO_SUBTITLES: SubtitleSettings = {
  on: false,
  model: 'base',
  language: 'auto',
  translate: false,
  style: 'tiktok',
  position: 'bottom',
  size: 6,
  color: '#ffd400',
  upper: true,
  words: 3,
  srt: false
}

export const subtitlesOf = (s: Pick<ExportSettings, 'subtitles'>): SubtitleSettings => ({ ...NO_SUBTITLES, ...(s.subtitles ?? {}) })

/** Idiomas mais comuns primeiro; o Whisper entende quase 100 */
export const SUB_LANGS: { id: string; label: string }[] = [
  { id: 'auto', label: 'Detectar sozinho' },
  { id: 'pt', label: 'Português' },
  { id: 'en', label: 'Inglês' },
  { id: 'es', label: 'Espanhol' },
  { id: 'fr', label: 'Francês' },
  { id: 'de', label: 'Alemão' },
  { id: 'it', label: 'Italiano' },
  { id: 'ja', label: 'Japonês' },
  { id: 'ko', label: 'Coreano' },
  { id: 'zh', label: 'Chinês' },
  { id: 'ru', label: 'Russo' },
  { id: 'ar', label: 'Árabe' },
  { id: 'hi', label: 'Hindi' }
]

/** Uma palavra falada, com início e fim em segundos */
export interface Word {
  text: string
  start: number
  end: number
}

/** Junta as palavras em blocos: no estilo tiktok, N palavras; no clássico, uma frase de até ~42 letras */
export function groupWords(words: Word[], perGroup: number, maxChars: number): Word[][] {
  const groups: Word[][] = []
  let cur: Word[] = []
  const flush = () => {
    if (cur.length) groups.push(cur)
    cur = []
  }
  for (const w of words) {
    const prev = cur[cur.length - 1]
    // Pausa longa ou fim de frase começa outro bloco
    if (prev && (w.start - prev.end > 0.6 || /[.!?…]$/.test(prev.text))) flush()
    const len = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length
    if (cur.length >= perGroup || (cur.length && len > maxChars)) flush()
    cur.push(w)
  }
  flush()
  return groups
}

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0')

export function srtTime(sec: number): string {
  const ms = Math.round(Math.max(0, sec) * 1000)
  return `${pad(ms / 3600000)}:${pad((ms / 60000) % 60)}:${pad((ms / 1000) % 60)},${pad(ms % 1000, 3)}`
}

function assTime(sec: number): string {
  const cs = Math.round(Math.max(0, sec) * 100)
  return `${Math.floor(cs / 360000)}:${pad((cs / 6000) % 60)}:${pad((cs / 100) % 60)}.${pad(cs % 100)}`
}

/** .srt com frases (o formato que YouTube e editores aceitam) */
export function buildSrt(words: Word[], timeScale = 1): string {
  return groupWords(words, 14, 42)
    .map((g, i) => `${i + 1}\n${srtTime(g[0].start / timeScale)} --> ${srtTime(g[g.length - 1].end / timeScale)}\n${g.map((w) => w.text).join(' ')}\n`)
    .join('\n')
}

/** "#ffd400" → "&H0000D4FF" (o ASS guarda as cores ao contrário: azul, verde, vermelho) */
const assColor = (hex: string) => {
  const h = /^#?[0-9a-f]{6}$/i.test(hex) ? hex.replace('#', '') : 'ffd400'
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase()
}

const escAss = (s: string) => s.replace(/\\/g, '\\\\').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\n/g, ' ')

/**
 * Legenda ASS para queimar no vídeo (W×H). No estilo tiktok cada bloco aparece inteiro e a palavra que está sendo
 * falada muda de cor; no clássico aparece a frase toda. Os tempos são os do trecho que vai para o vídeo.
 */
export function buildAss(words: Word[], sub: SubtitleSettings, W: number, H: number): string {
  const fs = Math.max(12, Math.round((H * Math.max(2, sub.size)) / 100))
  const align = sub.position === 'top' ? 8 : sub.position === 'middle' ? 5 : 2
  const marginV = Math.round(H * (sub.position === 'middle' ? 0 : 0.12))
  const marginH = Math.round(W * 0.06)
  const outline = Math.max(2, Math.round(fs / 12))
  const head = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Main,Segoe UI Black,${fs},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,${outline},${Math.round(outline / 2)},${align},${marginH},${marginH},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ]
  const up = (s: string) => (sub.upper ? s.toLocaleUpperCase() : s)
  const lines: string[] = []
  if (sub.style === 'tiktok') {
    const hi = assColor(sub.color)
    for (const g of groupWords(words, Math.max(1, sub.words), 28)) {
      g.forEach((w, i) => {
        // Cada palavra fica em destaque do seu início até o início da próxima (sem buraco entre elas)
        const from = i === 0 ? g[0].start : w.start
        const to = i < g.length - 1 ? g[i + 1].start : g[g.length - 1].end
        if (to - from < 0.02) return
        const text = g.map((x, k) => (k === i ? `{\\c${hi}\\fscx108\\fscy108}${escAss(up(x.text))}{\\r}` : escAss(up(x.text)))).join(' ')
        lines.push(`Dialogue: 0,${assTime(from)},${assTime(to)},Main,,0,0,0,,${text}`)
      })
    }
  } else {
    for (const g of groupWords(words, 14, 42)) lines.push(`Dialogue: 0,${assTime(g[0].start)},${assTime(g[g.length - 1].end)},Main,,0,0,0,,${escAss(up(g.map((w) => w.text).join(' ')))}`)
  }
  return [...head, ...lines, ''].join('\n')
}
