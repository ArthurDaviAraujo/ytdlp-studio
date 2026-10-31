import type { ExportSettings } from '../../../shared/types'

/** Mostra onde fica o corte no vídeo original e como o resultado vai ficar. */
export default function FramingPreview({ image, srcW, srcH, s }: { image: string | null; srcW: number; srcH: number; s: ExportSettings }) {
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
  const bg = image ? `url("${image}")` : undefined
  const boxH = 230
  const boxW = Math.round(boxH * dstAR)

  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 text-xs text-muted">Original ({srcW}×{srcH})</div>
        <div className="relative overflow-hidden rounded-lg bg-panel-3" style={{ aspectRatio: `${srcW} / ${srcH}`, width: `min(100%, ${Math.round(boxH * 1.4 * srcAR)}px)` }}>
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
                      backgroundImage: bg,
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
        <div className="relative overflow-hidden rounded-lg border border-line" style={{ width: boxW, height: boxH, background: s.framing === 'bars' ? s.barColor : '#000' }}>
          {image && (same || s.framing === 'crop') && (
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: bg,
                backgroundSize: same ? 'cover' : wider ? `auto 100%` : `100% auto`,
                backgroundPosition: same ? 'center' : wider ? `${pos * 100}% 0` : `0 ${pos * 100}%`
              }}
            />
          )}
          {image && !same && s.framing === 'blur' && (
            <div className="absolute -inset-4" style={{ backgroundImage: bg, backgroundSize: 'cover', backgroundPosition: 'center', filter: `blur(${Math.max(2, s.blur / 3)}px)` }} />
          )}
          {image && !same && s.framing !== 'crop' && <img src={image} alt="" className="absolute inset-0 h-full w-full object-contain" />}
        </div>
      </div>
    </div>
  )
}
