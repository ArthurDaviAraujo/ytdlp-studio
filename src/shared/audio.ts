import type { EqSettings, MusicClip } from './types'

/** Equalizador zerado */
export const EQ_FLAT: EqSettings = { gain: 0, bass: 0, mid: 0, treble: 0 }

/** Frequências das três faixas (Hz) e a largura do médio */
export const EQ_FREQ = { bass: 120, mid: 1000, treble: 4000 }
export const MID_Q = 0.9
export const EQ_RANGE = 12

export const dbToGain = (db: number) => Math.pow(10, db / 20)

/** Quanto do vídeo final (s) a música ocupa, a partir de `at` */
export function clipSpan(c: MusicClip, total: number): number {
  const room = Math.max(0, total - c.at)
  const left = c.loop || c.fileDuration == null ? Infinity : Math.max(0, c.fileDuration - c.start)
  return Math.min(room, c.length ?? Infinity, left)
}

/** Ponto do arquivo de música para `t` segundos depois de o clipe começar; null se a música já acabou */
export function clipFilePos(c: MusicClip, t: number): number | null {
  let p = c.start + t
  const d = c.fileDuration
  if (d && p >= d) {
    if (!c.loop) return null
    // Como o ffmpeg (-stream_loop), a repetição recomeça do início do arquivo
    p = (p - d) % d
  }
  return p
}

export const eqIsFlat = (e?: EqSettings | null) => !e || (e.gain === 0 && e.bass === 0 && e.mid === 0 && e.treble === 0)

/**
 * Filtros do ffmpeg iguais aos da prévia. Os dois lados usam as fórmulas de biquad do "Audio EQ Cookbook":
 * grave e agudo são prateleiras com inclinação 1 (como o lowshelf/highshelf do Web Audio) e o médio é um pico com Q 0,9.
 * O ganho entra no volume, junto com o controle de volume.
 */
export function eqFilters(e?: EqSettings | null): string[] {
  const out: string[] = []
  if (!e) return out
  if (e.bass) out.push(`bass=g=${e.bass}:f=${EQ_FREQ.bass}:t=s:w=1`)
  if (e.mid) out.push(`equalizer=f=${EQ_FREQ.mid}:t=q:w=${MID_Q}:g=${e.mid}`)
  if (e.treble) out.push(`treble=g=${e.treble}:f=${EQ_FREQ.treble}:t=s:w=1`)
  return out
}
