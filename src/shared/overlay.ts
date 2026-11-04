import type { ExportSettings, OverlaySettings, ScreenPos } from './types'

export const NO_OVERLAY: OverlaySettings = {
  text: '',
  textPos: 'bc',
  textSize: 5,
  textColor: '#ffffff',
  textBox: false,
  logo: '',
  logoPos: 'tr',
  logoSize: 15,
  logoOpacity: 90
}

export const overlayOf = (s: Pick<ExportSettings, 'overlay'>): OverlaySettings => ({ ...NO_OVERLAY, ...(s.overlay ?? {}) })

export const hasOverlay = (o: OverlaySettings) => !!o.text.trim() || !!o.logo

export const SCREEN_POS: { id: ScreenPos; label: string }[] = [
  { id: 'tl', label: 'Topo, à esquerda' },
  { id: 'tc', label: 'Topo, no centro' },
  { id: 'tr', label: 'Topo, à direita' },
  { id: 'ml', label: 'Meio, à esquerda' },
  { id: 'mc', label: 'Centro' },
  { id: 'mr', label: 'Meio, à direita' },
  { id: 'bl', label: 'Base, à esquerda' },
  { id: 'bc', label: 'Base, no centro' },
  { id: 'br', label: 'Base, à direita' }
]

/**
 * Expressões de x e y do ffmpeg para uma posição. W/H = tamanho do vídeo, w/h = tamanho do que entra por cima
 * (os nomes mudam de filtro para filtro, então vêm de fora). m = margem em pixels.
 */
export function placeXY(pos: ScreenPos, W: string, H: string, w: string, h: string, m: number): { x: string; y: string } {
  const x = pos[1] === 'l' ? `${m}` : pos[1] === 'c' ? `(${W}-${w})/2` : `${W}-${w}-${m}`
  const y = pos[0] === 't' ? `${m}` : pos[0] === 'm' ? `(${H}-${h})/2` : `${H}-${h}-${m}`
  return { x, y }
}
