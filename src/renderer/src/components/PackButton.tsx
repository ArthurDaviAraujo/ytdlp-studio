import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { packFor } from '../../../shared/packs'
import { Button, cx } from './ui'
import { bytes } from '../lib/format'
import { t } from '../../../shared/i18n'

/** Avisa o app inteiro que um pacote foi instalado (o App relê os programas) */
export const TOOLS_CHANGED = 'tools-changed'

/**
 * Botão "Baixar <IA> (tamanho)" com barra de progresso. O download continua mesmo se o botão sumir da tela;
 * quando termina, o app relê os programas e a opção fica disponível.
 */
export default function PackButton({ id, label, className }: { id: string; label?: string; className?: string }) {
  const def = packFor(id)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => window.api.onPackProgress((pid, p) => pid === id && setProgress(p)), [id])
  if (!def) return null

  const start = async () => {
    setError(null)
    setProgress(0)
    const r = await window.api.installPack(id)
    setProgress(null)
    if (!r.ok) setError(r.error)
    else window.dispatchEvent(new Event(TOOLS_CHANGED))
  }

  return (
    <div className={cx('space-y-1.5', className)}>
      {progress == null ? (
        <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={start} title={t(def.hint)}>
          {label ?? t('Baixar {name}', { name: t(def.name) })}
          {def.size ? ` (${bytes(def.size)})` : ''}
        </Button>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-3">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <span className="w-24 shrink-0 text-right tabular-nums">{progress >= 95 ? t('Instalando…') : `${Math.floor(progress)}%`}</span>
          <button className="rounded p-0.5 hover:bg-panel-3 hover:text-err" title={t('Cancelar')} onClick={() => void window.api.cancelPack(id)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {error && <p className="text-xs text-err">{error}</p>}
    </div>
  )
}
