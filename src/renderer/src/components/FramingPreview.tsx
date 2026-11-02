import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'
import { Move, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import type { ExportSettings } from '../../../shared/types'
import { duration as fmt, parseTime } from '../lib/format'
import { t } from '../../../shared/i18n'

/** Caminho do Windows → endereço file:// que o <video> do Electron consegue abrir */
const fileUrl = (p: string) => encodeURI('file:///' + p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/**
 * Original e resultado lado a lado. O recorte pode ser arrastado (e a rodinha do mouse dá zoom).
 * Os vídeos tocam juntos e a barra de tempo segue o vídeo ou leva ele ao ponto escolhido.
 */
export default function FramingPreview({
  image,
  srcW,
  srcH,
  s,
  onChange,
  video,
  total
}: {
  image: string | null
  srcW: number
  srcH: number
  s: ExportSettings
  onChange?: (patch: Partial<ExportSettings>) => void
  video?: string | null
  total?: number | null
}) {
  const fg = useRef<HTMLVideoElement>(null)
  const bg = useRef<HTMLVideoElement>(null)
  const orig = useRef<HTMLVideoElement>(null)
  const origBox = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [now, setNow] = useState(0)
  const [failed, setFailed] = useState(false)

  const start = parseTime(s.start) ?? 0
  const end = parseTime(s.end) ?? total ?? null
  const all = () => [fg.current, bg.current, orig.current].filter(Boolean) as HTMLVideoElement[]

  // Trocar de arquivo ou de trecho volta para o começo do trecho, parado
  useEffect(() => {
    setFailed(false)
    setPlaying(false)
    setNow(start)
    for (const v of all()) (v.pause(), (v.currentTime = start))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, start])

  useEffect(() => {
    for (const v of all()) v.playbackRate = s.speed > 0 ? s.speed : 1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.speed, playing])

  if (!srcW || !srcH) return null
  const outW = s.width || srcW
  const outH = s.height || srcH
  const srcAR = srcW / srcH
  const dstAR = outW / outH
  const crop = s.framing === 'crop'
  const zoom = crop ? Math.max(1, s.zoom || 1) : 1
  const same = Math.abs(srcAR - dstAR) < 0.01 && zoom === 1
  const wider = srcAR > dstAR
  // Tamanho do recorte em frações do original
  const fw = crop || same ? Math.min(1, (wider ? dstAR / srcAR : 1) / zoom) : 1
  const fh = crop || same ? Math.min(1, (wider ? 1 : srcAR / dstAR) / zoom) : 1
  const px = (s.position ?? 50) / 100
  const py = (s.positionY ?? 50) / 100
  const boxH = 300
  const boxW = Math.round(boxH * dstAR)
  const canPlay = !!video && !failed
  const showWindow = !same && crop

  const seek = (t: number) => {
    for (const v of all()) v.currentTime = t
    setNow(t)
  }

  const toggle = () => {
    const v = fg.current
    if (!v) return
    if (v.paused) {
      if (v.currentTime < start || (end != null && v.currentTime >= end)) seek(start)
      void v.play()
    } else v.pause()
  }

  const onTime = () => {
    const v = fg.current
    if (!v) return
    // Toca só o trecho escolhido, em repetição
    if (end != null && v.currentTime >= end) seek(start)
    for (const o of [bg.current, orig.current]) if (o && Math.abs(o.currentTime - v.currentTime) > 0.25) o.currentTime = v.currentTime
    setNow(v.currentTime)
  }

  // Arrastar o quadro do recorte: o deslocamento do mouse vira posição de 0 a 100 em cada eixo
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onChange) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, px, py }
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const box = origBox.current?.getBoundingClientRect()
    if (!d || !box || !onChange) return
    const patch: Partial<ExportSettings> = {}
    if (fw < 0.999) patch.position = Math.round(clamp(d.px + (e.clientX - d.x) / (box.width * (1 - fw)), 0, 1) * 100)
    if (fh < 0.999) patch.positionY = Math.round(clamp(d.py + (e.clientY - d.y) / (box.height * (1 - fh)), 0, 1) * 100)
    onChange(patch)
  }
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!onChange || !crop) return
    onChange({ zoom: Math.round(clamp(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 1, 4) * 100) / 100 })
  }

  // Resultado no modo corte: o vídeo inteiro ampliado e deslocado dentro da caixa (vale para qualquer zoom)
  const cropStyle: CSSProperties = {
    position: 'absolute',
    width: boxW / fw,
    height: boxH / fh,
    left: -(boxW / fw - boxW) * px,
    top: -(boxH / fh - boxH) * py,
    maxWidth: 'none',
    objectFit: 'fill'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span>{t('Original (')}{srcW}×{srcH})</span>
            {showWindow && onChange && (
              <span className="flex items-center gap-2">
                <Move className="h-3.5 w-3.5" />{t(' arraste · rodinha = zoom ')}{zoom.toFixed(1)}x
                <button className="rounded-full bg-panel-3 px-2 py-0.5 text-text hover:bg-line" onClick={() => onChange({ position: 50, positionY: 50 })}>
                  {t('Centralizar')}
                </button>
                <button className="rounded-full bg-panel-3 px-2 py-0.5 text-text hover:bg-line" onClick={() => onChange({ position: 50, positionY: 50, zoom: 1 })}>
                  {t('Resetar')}
                </button>
              </span>
            )}
          </div>
          <div
            ref={origBox}
            className="relative overflow-hidden rounded-lg bg-panel-3"
            style={{ aspectRatio: `${srcW} / ${srcH}`, width: `min(100%, ${Math.round(boxH * 1.2 * srcAR)}px)` }}
            onWheel={onWheel}
          >
            {canPlay ? (
              <video ref={orig} src={fileUrl(video!)} muted preload="auto" className="h-full w-full object-cover" onLoadedMetadata={(e) => (e.currentTarget.currentTime = start)} />
            ) : (
              image && <img src={image} alt="" className="h-full w-full object-cover" />
            )}
            {showWindow && (
              <div
                className="absolute cursor-grab border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] active:cursor-grabbing"
                style={{ width: `${fw * 100}%`, height: `${fh * 100}%`, left: `${(1 - fw) * px * 100}%`, top: `${(1 - fh) * py * 100}%`, touchAction: 'none' }}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={() => (drag.current = null)}
              />
            )}
          </div>
        </div>

        <div className="shrink-0">
          <div className="mb-1.5 text-xs text-muted">
            {t('Resultado (')}{outW}×{outH})
          </div>
          <div className="relative overflow-hidden rounded-lg border border-line" style={{ width: boxW, height: boxH, background: s.framing === 'bars' && !same ? s.barColor : '#000' }}>
            {canPlay ? (
              <>
                {!same && s.framing === 'blur' && (
                  <video ref={bg} src={fileUrl(video!)} muted preload="auto" className="absolute -inset-4 h-[calc(100%+2rem)] w-[calc(100%+2rem)] object-cover" style={{ filter: `blur(${Math.max(2, s.blur / 3)}px)` }} />
                )}
                <video
                  ref={fg}
                  src={fileUrl(video!)}
                  muted={muted}
                  preload="auto"
                  className={crop || same ? '' : 'absolute inset-0 h-full w-full object-contain'}
                  style={crop || same ? cropStyle : undefined}
                  onClick={toggle}
                  onPlay={() => (setPlaying(true), void bg.current?.play(), void orig.current?.play())}
                  onPause={() => (setPlaying(false), bg.current?.pause(), orig.current?.pause())}
                  onTimeUpdate={onTime}
                  onLoadedMetadata={(e) => (e.currentTarget.currentTime = start)}
                  onError={() => setFailed(true)}
                />
              </>
            ) : (
              image && (
                <>
                  {!same && s.framing === 'blur' && (
                    <div className="absolute -inset-4" style={{ backgroundImage: `url("${image}")`, backgroundSize: 'cover', backgroundPosition: 'center', filter: `blur(${Math.max(2, s.blur / 3)}px)` }} />
                  )}
                  <img src={image} alt="" className={crop || same ? '' : 'absolute inset-0 h-full w-full object-contain'} style={crop || same ? cropStyle : undefined} />
                </>
              )
            )}
          </div>
        </div>
      </div>

      {canPlay && (
        <div className="flex items-center gap-3">
          <button onClick={toggle} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-white hover:bg-accent-hover" title={playing ? t('Pausar') : t('Tocar a prévia')}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <button onClick={() => setMuted(!muted)} className="text-muted hover:text-text" title={muted ? t('Ligar o som') : t('Tirar o som')}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <span className="w-12 text-right text-xs text-muted">{fmt(now)}</span>
          <input
            type="range"
            aria-label={t('Momento da prévia')}
            min={start}
            max={end ?? Math.max(start + 1, now)}
            step={0.05}
            value={now}
            onChange={(e) => seek(Number(e.target.value))}
            className="flex-1 accent-[#ff4d4d]"
          />
          <span className="w-12 text-xs text-muted">{end != null ? fmt(end) : ''}</span>
          {s.speed !== 1 && <span className="text-xs text-muted">{s.speed}x</span>}
        </div>
      )}
      {video && failed && <p className="text-xs text-warn">{t('Este formato não toca na prévia; o resultado final não é afetado.')}</p>}
    </div>
  )
}
