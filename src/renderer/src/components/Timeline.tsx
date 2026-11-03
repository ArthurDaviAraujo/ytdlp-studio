import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Music } from 'lucide-react'
import { cx } from './ui'
import { duration } from '../lib/format'

export interface Piece {
  start: number
  end: number
  removed: boolean
}

/** Intervalos possíveis entre as marcas da régua, em segundos */
const TICKS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600]

export const clock = (sec: number) => {
  const s = Math.max(0, sec)
  return `${duration(Math.floor(s))}.${Math.floor((s % 1) * 10)}`
}

interface Props {
  total: number
  pieces: Piece[]
  selected: number | null
  now: number
  zoom: number
  thumbs: { time: number; src: string | null }[]
  peaks: number[]
  following: boolean
  onSeek: (t: number) => void
  onSelect: (i: number | null) => void
  /** Começo do arraste de uma divisa (guarda o estado para o desfazer) */
  onBoundaryStart: () => void
  onBoundaryMove: (i: number, t: number) => void
  /** Músicas: cada uma numa trilha embaixo, no ponto do vídeo final em que toca */
  musics?: TimelineClip[]
  /** Arrastar o clipe muda onde ele começa (at); as pontas cortam o começo (start) e o fim (length) */
  onClipChange?: (id: string, patch: { at?: number; start?: number; length?: number | null }) => void
  /** Velocidade do vídeo: o tempo das músicas é o do vídeo final, já acelerado */
  speed?: number
}

export interface TimelineClip {
  id: string
  name: string
  peaks: number[]
  /** Duração do arquivo (s), 0 se ainda não se sabe */
  fileDuration: number
  at: number
  start: number
  /** Quanto do vídeo final o clipe ocupa (s) */
  span: number
  loop: boolean
}

const LANE = 44

/** Linha do tempo: régua, miniaturas, onda do áudio, trechos (removidos em listras), divisas arrastáveis e agulha. */
export default function Timeline({ total, pieces, selected, now, zoom, thumbs, peaks, following, onSeek, onSelect, onBoundaryStart, onBoundaryMove, musics = [], onClipChange, speed = 1 }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  // Enquanto a pessoa mexe na barra de rolagem (ou acabou de mexer), a linha do tempo não persegue a agulha
  const userUntil = useRef(0)
  // Hora em que a pessoa apertou dentro da linha do tempo (0 = solto); expira sozinho se o soltar se perder
  const holding = useRef(0)
  const ownScroll = useRef(false)

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Pixels por segundo: no zoom 1 o vídeo inteiro cabe na largura
  const pps = total > 0 ? ((width - 2) / total) * zoom : 1
  const inner = Math.max(width - 2, total * pps)
  const x = (sec: number) => sec * pps

  // Ao tocar, rola para a agulha não sair da tela
  useEffect(() => {
    const el = scroller.current
    if (!el || !following || Date.now() - holding.current < 8000 || Date.now() < userUntil.current) return
    const px = x(now)
    if (px < el.scrollLeft + 40 || px > el.scrollLeft + el.clientWidth - 40) {
      ownScroll.current = true
      el.scrollLeft = Math.max(0, px - el.clientWidth * 0.25)
    }
  })

  const tick = useMemo(() => TICKS.find((s) => s * pps >= 80) ?? 3600, [pps])
  const labels = useMemo(() => {
    const out: number[] = []
    for (let s = 0; s <= total + 0.001; s += tick) out.push(s)
    return out
  }, [tick, total])

  const wave = useMemo(() => {
    if (!peaks.length) return ''
    const top = peaks.map((p, i) => `${i},${50 - p * 46}`)
    const bottom = peaks.map((p, i) => `${i},${50 + p * 46}`).reverse()
    return [...top, ...bottom].join(' ')
  }, [peaks])

  const timeAt = (clientX: number) => {
    const el = scroller.current!
    const r = el.getBoundingClientRect()
    return Math.min(total, Math.max(0, (clientX - r.left + el.scrollLeft) / pps))
  }

  // Arrastar na régua ou na agulha move o vídeo
  const scrub = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    onSeek(timeAt(e.clientX))
    const move = (ev: PointerEvent) => onSeek(timeAt(ev.clientX))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const dragBoundary = (i: number) => (e: ReactPointerEvent) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    onBoundaryStart()
    const move = (ev: PointerEvent) => onBoundaryMove(i, timeAt(ev.clientX))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const thumbW = thumbs.length ? x(total / thumbs.length) : 0

  // Onde cada trecho que fica começa no vídeo final (as músicas correm nesse tempo)
  const keptOffsets = useMemo(() => {
    let acc = 0
    return pieces.map((p) => {
      const at = acc
      if (!p.removed) acc += p.end - p.start
      return at
    })
  }, [pieces])
  const outTotal = pieces.reduce((acc, p) => acc + (p.removed ? 0 : p.end - p.start), 0) / speed

  /** Tempo no vídeo final para um ponto do original (parado dentro de trecho apagado) */
  const outAt = (sec: number) => {
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]
      if (sec < p.end || i === pieces.length - 1) return (keptOffsets[i] + (p.removed ? 0 : Math.min(p.end - p.start, Math.max(0, sec - p.start)))) / speed
    }
    return 0
  }

  /**
   * Arrasta um clipe de música. 'move' muda onde ele começa no vídeo; 'left' corta o começo da música
   * (o clipe começa mais tarde, pegando a música mais adiante); 'right' muda até onde ela toca.
   */
  const dragClip = (c: TimelineClip, mode: 'move' | 'left' | 'right') => (e: ReactPointerEvent) => {
    if (!onClipChange) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const o0 = outAt(timeAt(e.clientX))
    const move = (ev: PointerEvent) => {
      const d = outAt(timeAt(ev.clientX)) - o0
      if (mode === 'move') onClipChange(c.id, { at: Math.min(Math.max(0, outTotal - 0.3), Math.max(0, c.at + d)) })
      else if (mode === 'left') {
        // Não passa do começo do arquivo nem deixa o clipe com menos de 0,3 s
        const dd = Math.min(c.span - 0.3, Math.max(-c.start, -c.at, d))
        onClipChange(c.id, { at: c.at + dd, start: c.start + dd, length: c.span - dd })
      } else {
        const max = c.loop || !c.fileDuration ? outTotal - c.at : Math.min(outTotal - c.at, c.fileDuration - c.start)
        onClipChange(c.id, { length: Math.min(max, Math.max(0.3, c.span + d)) })
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={scroller}
      className="overflow-x-auto overflow-y-hidden rounded-xl border border-line bg-panel select-none"
      onWheel={(e) => {
        userUntil.current = Date.now() + 2000
        if (!e.shiftKey) e.currentTarget.scrollLeft += e.deltaY
      }}
      onPointerDown={() => (holding.current = Date.now())}
      onPointerUp={() => {
        holding.current = 0
        userUntil.current = Date.now() + 1500
      }}
      onScroll={() => {
        // Rolagem feita pela pessoa (barra, rodinha): para de seguir a agulha por um tempo
        if (ownScroll.current) ownScroll.current = false
        else userUntil.current = Date.now() + 2000
      }}
    >
      <div className="relative" style={{ width: inner }}>
        {/* Régua */}
        <div className="relative h-6 cursor-ew-resize border-b border-line" onPointerDown={scrub}>
          {labels.map((s) => (
            <div key={s} className="absolute top-0 h-full border-l border-line/80 pl-1 text-[10px] leading-6 text-faint" style={{ left: x(s) }}>
              {tick < 1 ? clock(s) : duration(s)}
            </div>
          ))}
        </div>

        {/* Miniaturas e onda */}
        <div className="relative h-[72px] overflow-hidden bg-panel-3">
          {thumbs.map((th, i) =>
            th.src ? <img key={i} src={th.src} alt="" draggable={false} className="absolute top-0 h-full object-cover" style={{ left: x((total / thumbs.length) * i), width: thumbW + 1 }} /> : null
          )}
        </div>
        <div className="relative h-14 border-t border-line bg-bg">
          {wave && (
            <svg viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              <polygon points={wave} className="fill-accent/55" />
            </svg>
          )}
        </div>

        {/* Uma trilha por música: o clipe aparece nos trechos que ficam, no ponto do vídeo final em que toca */}
        {musics.map((c) => (
          <ClipLane key={c.id} clip={c} pieces={pieces} keptOffsets={keptOffsets} speed={speed} x={x} onDrag={dragClip} />
        ))}

        {/* Trechos por cima das miniaturas e da onda */}
        <div className="absolute inset-x-0 top-6" style={{ bottom: musics.length * LANE }}>
          {pieces.map((p, i) => (
            <div
              key={`${p.start}-${i}`}
              onPointerDown={(e) => {
                onSelect(i)
                onSeek(timeAt(e.clientX))
              }}
              className={cx(
                'absolute inset-y-0 cursor-pointer border-x border-black/40',
                p.removed && 'bg-[repeating-linear-gradient(135deg,rgba(11,13,18,.82)_0_7px,rgba(11,13,18,.62)_7px_14px)]',
                selected === i && 'z-10 outline-2 -outline-offset-2 outline-accent'
              )}
              style={{ left: x(p.start), width: Math.max(1, x(p.end - p.start)) }}
            />
          ))}
          {pieces.slice(0, -1).map((p, i) => (
            <div
              key={`b-${i}`}
              onPointerDown={dragBoundary(i)}
              className="group absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-col-resize"
              style={{ left: x(p.end) }}
            >
              <div className="mx-auto h-full w-[3px] rounded-full bg-text/85 group-hover:bg-accent" />
            </div>
          ))}
        </div>

        {/* Agulha */}
        <div className="pointer-events-none absolute inset-y-0 z-30 w-0" style={{ left: x(now) }}>
          <div className="absolute inset-y-0 -left-px w-0.5 bg-accent" />
          <div className="pointer-events-auto absolute -top-0.5 -left-[7px] h-3.5 w-3.5 cursor-ew-resize rounded-sm bg-accent" onPointerDown={scrub} />
        </div>
      </div>
    </div>
  )
}

/** Trilha de uma música: onda, faixas listradas nos trechos apagados, alças nas pontas e nome */
function ClipLane({ clip: c, pieces, keptOffsets, speed, x, onDrag }: { clip: TimelineClip; pieces: Piece[]; keptOffsets: number[]; speed: number; x: (s: number) => number; onDrag: (c: TimelineClip, mode: 'move' | 'left' | 'right') => (e: ReactPointerEvent) => void }) {
  // Onda em segundos do arquivo; repetida quando a música recomeça (loop)
  const wave = useMemo(() => {
    if (!c.peaks.length || !c.fileDuration) return [] as string[]
    const step = c.fileDuration / c.peaks.length
    const copies = c.loop ? Math.max(1, Math.ceil((c.start + c.span) / c.fileDuration) + 1) : 1
    const out: string[] = []
    for (let k = 0; k < copies; k++) {
      const off = k * c.fileDuration
      const top = c.peaks.map((p, i) => `${(off + i * step).toFixed(3)},${50 - p * 44}`)
      const bottom = c.peaks.map((p, i) => `${(off + i * step).toFixed(3)},${50 + p * 44}`).reverse()
      out.push([...top, ...bottom].join(' '))
    }
    return out
  }, [c.peaks, c.fileDuration, c.loop, c.start, c.span])

  const end = c.at + c.span
  // Pedaços do clipe que caem em trechos que ficam (no original, o vídeo final pula os apagados)
  const bits: { left: number; width: number; from: number; len: number; first: boolean; last: boolean }[] = []
  pieces.forEach((p, i) => {
    if (p.removed) return
    // Tempo final do trecho (acelerado); no original, cada segundo final vale `speed` segundos
    const o = keptOffsets[i] / speed
    const a = Math.max(c.at, o)
    const b = Math.min(end, o + (p.end - p.start) / speed)
    if (b - a <= 0.001) return
    bits.push({ left: x(p.start + (a - o) * speed), width: Math.max(2, x((b - a) * speed)), from: c.start + (a - c.at), len: b - a, first: Math.abs(a - c.at) < 0.001, last: Math.abs(b - end) < 0.001 })
  })

  return (
    <div className="relative border-t border-line bg-panel-2" style={{ height: LANE }} title={c.name}>
      {pieces.map((p, i) =>
        p.removed ? <div key={i} className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgba(11,13,18,.7)_0_7px,rgba(11,13,18,.45)_7px_14px)]" style={{ left: x(p.start), width: x(p.end - p.start) }} /> : null
      )}
      {bits.map((b, i) => (
        <div
          key={i}
          onPointerDown={onDrag(c, 'move')}
          className={cx('absolute inset-y-1 cursor-grab overflow-hidden border-y border-info/50 bg-info/15 active:cursor-grabbing', b.first && 'rounded-l-md border-l', b.last && 'rounded-r-md border-r')}
          style={{ left: b.left, width: b.width }}
        >
          <svg viewBox={`${b.from.toFixed(3)} 0 ${Math.max(0.001, b.len).toFixed(3)} 100`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            {wave.map((pts, k) => (
              <polygon key={k} points={pts} className="fill-info/70" />
            ))}
          </svg>
          {b.first && <div onPointerDown={onDrag(c, 'left')} className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize bg-info/60 hover:bg-info" />}
          {b.last && <div onPointerDown={onDrag(c, 'right')} className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize bg-info/60 hover:bg-info" />}
          {b.first && (
            <div className="pointer-events-none absolute top-0.5 left-3 z-10 flex max-w-[80%] items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-info">
              <Music className="h-3 w-3 shrink-0" />
              <span className="truncate">{c.name}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
