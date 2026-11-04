import { useEffect, useRef, useState } from 'react'
import { Eye, Sparkles } from 'lucide-react'
import type { ExportSettings } from '../../../shared/types'
import { enhanceOf, hasImageEnhance } from '../../../shared/enhance'
import { Button, Spinner, cx } from './ui'
import { t } from '../../../shared/i18n'

/**
 * Antes e depois num quadro do vídeo, com uma divisória que se arrasta.
 * Sem IA, a prévia se atualiza sozinha a cada mudança; com IA (alguns segundos por quadro), só no botão.
 */
export default function BeforeAfter({ input, settings, time }: { input: string; settings: ExportSettings; time: number }) {
  const e = enhanceOf(settings)
  const usesAi = e.upscaler !== 'none'
  const active = hasImageEnhance(e)
  const [shot, setShot] = useState<{ before: string; after: string; seconds: number; key: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [split, setSplit] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  // Tudo o que muda a imagem (o som e o FPS não entram)
  const key = JSON.stringify([input, time, settings.width, settings.height, settings.framing, settings.position, settings.positionY, settings.zoom, settings.blur, settings.barColor, settings.aiGpu, e, undefined])
  const stale = shot != null && shot.key !== key
  const seq = useRef(0)

  const run = async () => {
    const id = ++seq.current
    setBusy(true)
    setError(null)
    const r = await window.api.previewEnhance(input, settings, time)
    if (id !== seq.current) return
    setBusy(false)
    if (!r.ok || !r.before || !r.after) return setError(r.error ?? t('Não consegui gerar a prévia'))
    setShot({ before: r.before, after: r.after, seconds: r.seconds, key })
  }

  // Sem IA é rápido: atualiza sozinho pouco depois de cada mudança
  useEffect(() => {
    if (!active || usesAi) return
    const timer = setTimeout(() => void run(), 450)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active, usesAi])

  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (r) setSplit(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)))
  }

  if (!active) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-xs text-faint">
        <Eye className="h-4 w-4 shrink-0" />
        {t('Ligue algum ajuste na aba Imagem para comparar o antes e o depois aqui.')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-warn" />
          {t('Antes e depois')}
        </div>
        {usesAi && (
          <Button size="sm" variant={stale || !shot ? 'primary' : 'secondary'} icon={busy ? <Spinner className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} onClick={busy ? () => void window.api.cancelPreview() : run}>
            {busy ? t('Gerando… (clique para cancelar)') : shot ? t('Atualizar prévia') : t('Ver com a IA')}
          </Button>
        )}
        {!usesAi && busy && <Spinner className="h-3.5 w-3.5 text-muted" />}
        {shot && !busy && <span className="text-xs text-faint">{t('quadro pronto em {s} s', { s: shot.seconds.toFixed(1) })}</span>}
        {stale && !busy && usesAi && <span className="text-xs text-warn">{t('as opções mudaram')}</span>}
      </div>
      {error && <p className="text-xs text-err">{error}</p>}
      {!shot && usesAi && !busy && !error && <p className="text-xs text-faint">{t('A IA leva alguns segundos por quadro, então a prévia com ela é gerada só quando você pedir.')}</p>}
      {shot && (
        <div
          ref={box}
          className={cx('relative mx-auto w-fit max-w-full cursor-ew-resize overflow-hidden rounded-lg border border-line bg-black select-none', busy && 'opacity-70')}
          onPointerDown={(ev) => {
            dragging.current = true
            ev.currentTarget.setPointerCapture(ev.pointerId)
            move(ev.clientX)
          }}
          onPointerMove={(ev) => dragging.current && move(ev.clientX)}
          onPointerUp={() => (dragging.current = false)}
        >
          <img src={shot.after} alt={t('Depois')} draggable={false} className="block max-h-[520px] max-w-full" />
          <img src={shot.before} alt={t('Antes')} draggable={false} className="absolute inset-0 h-full w-full" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-[0_0_6px_rgba(0,0,0,0.8)]" style={{ left: `${split}%` }}>
            <div className="absolute top-1/2 left-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[11px] font-bold text-[#10131a] shadow">⇆</div>
          </div>
          <span className="pointer-events-none absolute top-2 left-2 rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-white">{t('Antes')}</span>
          <span className="pointer-events-none absolute top-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[11px] text-warn">{t('Depois')}</span>
        </div>
      )}
      {shot && <p className="text-xs text-faint">{t('Arraste a divisória para comparar. Estabilizar e tirar o pisca-pisca só aparecem no vídeo final.')}</p>}
    </div>
  )
}
