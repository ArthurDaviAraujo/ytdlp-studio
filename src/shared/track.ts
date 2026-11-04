import type { ExportSettings, TrackPath } from './types'

/** Posição (0–100 da largura e da altura) no tempo t, por interpolação entre os pontos */
export function trackAt(points: TrackPath['points'], t: number): { x: number; y: number } | null {
  if (!points.length) return null
  if (t <= points[0].t) return points[0]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (t <= b.t) {
      const k = (t - a.t) / (b.t - a.t || 1)
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    }
  }
  return points[points.length - 1]
}

/** As posições valem para este vídeo? (foram medidas nele e o enquadramento é de corte) */
export const trackFor = (s: Pick<ExportSettings, 'track' | 'framing'>, path: string | null | undefined): TrackPath | null =>
  s.framing === 'crop' && s.track && path && s.track.key === path && s.track.points.length ? s.track : null
