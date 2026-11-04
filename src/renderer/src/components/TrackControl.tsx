import { useRef, useState } from 'react'
import { ScanFace, X } from 'lucide-react'
import type { ExportSettings } from '../../../shared/types'
import { trackFor } from '../../../shared/track'
import { Button, Spinner } from './ui'
import { trackSubject } from '../lib/track'
import { parseTime } from '../lib/format'
import { t } from '../../../shared/i18n'

/** "Seguir rosto ou pessoa": mede onde a pessoa está ao longo do vídeo e o corte passa a andar junto */
export default function TrackControl({ value, onChange, inputPath, duration }: { value: ExportSettings; onChange: (s: ExportSettings) => void; inputPath: string; duration: number }) {
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [found, setFound] = useState<{ found: number; total: number } | null>(null)
  const cancel = useRef(false)
  const track = trackFor(value, inputPath)

  const run = async () => {
    cancel.current = false
    setError(null)
    setProgress(0)
    try {
      const start = parseTime(value.start) ?? 0
      const end = parseTime(value.end) ?? duration
      const r = await trackSubject(inputPath, start, end, setProgress, () => cancel.current)
      if (cancel.current) return
      setFound({ found: r.found, total: r.total })
      if (!r.found) return setError(t('Não achei rosto nem pessoa neste trecho. O corte continua fixo.'))
      onChange({ ...value, track: { key: inputPath, points: r.points } })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProgress(null)
    }
  }

  return (
    <div className="space-y-1.5 rounded-lg bg-panel-2 p-2.5">
      {progress != null ? (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Spinner className="h-3.5 w-3.5" />
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-3">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <span className="w-9 text-right tabular-nums">{Math.floor(progress)}%</span>
          <button className="rounded p-0.5 hover:bg-panel-3 hover:text-err" title={t('Cancelar')} onClick={() => (cancel.current = true)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : track ? (
        <div className="space-y-1.5 text-xs">
          <div className="flex items-start gap-2">
          <ScanFace className="h-4 w-4 shrink-0 text-ok" />
          <span className="flex-1 text-text">
            {t('O corte está seguindo a pessoa')}
            {found ? <span className="text-muted"> · {t('achou em {n}% dos quadros', { n: Math.round((found.found / Math.max(1, found.total)) * 100) })}</span> : null}
          </span>
          </div>
          <div className="flex gap-2 pl-6">
          <Button size="sm" variant="ghost" onClick={run}>
            {t('Medir de novo')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onChange({ ...value, track: null })}>
            {t('Desligar')}
          </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" icon={<ScanFace className="h-3.5 w-3.5" />} onClick={run}>
          {t('Seguir rosto ou pessoa')}
        </Button>
      )}
      {error && <p className="text-xs text-warn">{error}</p>}
      {!track && progress == null && !error && <p className="text-xs text-faint">{t('A IA acha o rosto (ou a pessoa) em cada momento e o corte anda junto, suave como uma câmera. A prévia toca seguindo.')}</p>}
    </div>
  )
}
