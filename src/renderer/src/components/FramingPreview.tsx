import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import type { ExportSettings } from '../../../shared/types'
import { duration, parseTime } from '../lib/format'

/** Caminho do Windows → endereço file:// que o <video> do Electron consegue abrir */
const fileUrl = (p: string) => encodeURI('file:///' + p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')

/** Mostra onde fica o corte no vídeo original e o resultado, que pode ser tocado com o enquadramento aplicado. */
export default function FramingPreview({ image, srcW, srcH, s, video }: { image: string | null; srcW: number; srcH: number; s: ExportSettings; video?: string | null }) {
  const fg = useRef<HTMLVideoElement>(null)
  const bg = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [now, setNow] = useState(0)
  const [failed, setFailed] = useState(false)

  const start = parseTime(s.start) ?? 0
  const end = parseTime(s.end)

  // Trocar de arquivo ou de trecho volta para o começo do trecho, parado
  useEffect(() => {
    setFailed(false)
    setPlaying(false)
    for (const v of [fg.current, bg.current]) if (v) (v.pause(), (v.currentTime = start))
  }, [video, start])

  useEffect(() => {
    for (const v of [fg.current, bg.current]) if (v) v.playbackRate = s.speed > 0 ? s.speed : 1
  }, [s.speed, playing])

  if (!srcW || !srcH) return null
  const outW = s.width || srcW
  const outH = s.height || srcH
  const srcAR = srcW / srcH
  const dstAR = outW / outH
  const same = Math.abs(srcAR - dstAR) < 0.01
  const wider = srcAR > dstAR
  // Fração do original que o corte mantém, no eixo que é cortado
  const frac = same ? 1 : wider ? dstAR / srcAR : srcAR / dstAR
  const pos = s.position / 100
  const bgImg = image ? `url("${image}")` : undefined
  const boxH = 300
  const boxW = Math.round(boxH * dstAR)
  const canPlay = !!video && !failed

  const fit: CSSProperties =
    same || s.framing === 'crop'
      ? { objectFit: 'cover', objectPosition: same ? 'center' : wider ? `${pos * 100}% 50%` : `50% ${pos * 100}%` }
      : { objectFit: 'contain' }

  const toggle = () => {
    const v = fg.current
    if (!v) return
    if (v.paused) {
      if (v.currentTime < start || (end != null && v.currentTime >= end)) v.currentTime = start
      void v.play()
    } else v.pause()
  }

  const onTime = () => {
    const v = fg.current
    if (!v) return
    // Toca só o trecho escolhido, em repetição
    if (end != null && v.currentTime >= end) v.currentTime = start
    if (bg.current && Math.abs(bg.current.currentTime - v.currentTime) > 0.3) bg.current.currentTime = v.currentTime
    setNow(v.currentTime)
  }

  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 text-xs text-muted">Original ({srcW}×{srcH})</div>
        <div className="relative overflow-hidden rounded-lg bg-panel-3" style={{ aspectRatio: `${srcW} / ${srcH}`, width: `min(100%, ${Math.round(boxH * 1.2 * srcAR)}px)` }}>
          {image && <img src={image} alt="" className="h-full w-full object-cover" />}
          {!same && s.framing === 'crop' && (
            <>
              <div className="absolute inset-0 bg-black/55" />
              <div
                className="absolute overflow-hidden border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
                style={
                  wider
                    ? { top: 0, bottom: 0, width: `${frac * 100}%`, left: `${(1 - frac) * pos * 100}%` }
                    : { left: 0, right: 0, height: `${frac * 100}%`, top: `${(1 - frac) * pos * 100}%` }
                }
              >
                {image && (
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: bgImg,
                      backgroundSize: wider ? `${100 / frac}% 100%` : `100% ${100 / frac}%`,
                      backgroundPosition: wider ? `${pos * 100}% 0` : `0 ${pos * 100}%`
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0">
        <div className="mb-1.5 text-xs text-muted">
          Resultado ({outW}×{outH})
        </div>
        <div
          className="relative overflow-hidden rounded-lg border border-line"
          style={{ width: boxW, height: boxH, background: s.framing === 'bars' && !same ? s.barColor : '#000' }}
        >
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
                className="absolute inset-0 h-full w-full"
                style={fit}
                onClick={toggle}
                onPlay={() => (setPlaying(true), void bg.current?.play())}
                onPause={() => (setPlaying(false), bg.current?.pause())}
                onTimeUpdate={onTime}
                onLoadedMetadata={(e) => (e.currentTarget.currentTime = start)}
                onError={() => setFailed(true)}
              />
            </>
          ) : (
            <>
              {image && (same || s.framing === 'crop') && (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: bgImg,
                    backgroundSize: same ? 'cover' : wider ? `auto 100%` : `100% auto`,
                    backgroundPosition: same ? 'center' : wider ? `${pos * 100}% 0` : `0 ${pos * 100}%`
                  }}
                />
              )}
              {image && !same && s.framing === 'blur' && (
                <div className="absolute -inset-4" style={{ backgroundImage: bgImg, backgroundSize: 'cover', backgroundPosition: 'center', filter: `blur(${Math.max(2, s.blur / 3)}px)` }} />
              )}
              {image && !same && s.framing !== 'crop' && <img src={image} alt="" className="absolute inset-0 h-full w-full object-contain" />}
            </>
          )}
        </div>
        {canPlay && (
          <div className="mt-2 flex items-center gap-2" style={{ width: boxW }}>
            <button onClick={toggle} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-white hover:bg-accent-hover" title={playing ? 'Pausar' : 'Tocar a prévia'}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <button onClick={() => setMuted(!muted)} className="text-muted hover:text-text" title={muted ? 'Ligar o som' : 'Tirar o som'}>
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <span className="truncate text-xs text-muted">
              {duration(now)}
              {s.speed !== 1 && ` · ${s.speed}x`}
            </span>
          </div>
        )}
        {video && failed && <p className="mt-2 text-xs text-warn" style={{ width: boxW }}>Este formato não toca na prévia; o resultado final não é afetado.</p>}
      </div>
    </div>
  )
}
