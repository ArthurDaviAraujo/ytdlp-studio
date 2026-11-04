import { useEffect, useState } from 'react'
import { CheckCircle2, Trash2 } from 'lucide-react'
import type { PackInfo } from '../../../shared/types'
import { packFor } from '../../../shared/packs'
import { Card } from './ui'
import PackButton, { TOOLS_CHANGED } from './PackButton'
import { bytes } from '../lib/format'
import { t } from '../../../shared/i18n'

/** Todas as IAs e modelos: o que já está no PC e o que dá para baixar */
export default function PacksCard() {
  const [packs, setPacks] = useState<PackInfo[]>([])
  const load = () => void window.api.listPacks().then(setPacks)
  useEffect(() => {
    load()
    window.addEventListener(TOOLS_CHANGED, load)
    return () => window.removeEventListener(TOOLS_CHANGED, load)
  }, [])

  return (
    <Card title={t('IAs e modelos')}>
      <p className="mb-3 text-sm text-muted">{t('O app baixa cada IA só quando você precisa dela, direto do GitHub ou do Hugging Face. Depois de baixada, tudo roda no seu PC, sem internet.')}</p>
      <div className="divide-y divide-line">
        {packs.map((p) => {
          const def = packFor(p.id)
          return (
            <div key={p.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm">
                  {p.installed && <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />}
                  {t(p.name)}
                  {p.size ? <span className="text-xs text-faint">· {bytes(p.size)}</span> : null}
                </div>
                {def && <div className="text-xs text-muted">{t(def.hint)}</div>}
              </div>
              {p.installed ? (
                <button
                  className="rounded p-1.5 text-muted hover:bg-panel-3 hover:text-err"
                  title={t('Apagar a cópia baixada (a que veio com o app fica)')}
                  onClick={async () => {
                    await window.api.removePack(p.id)
                    window.dispatchEvent(new Event(TOOLS_CHANGED))
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <PackButton id={p.id} label={t('Baixar')} className="w-56 shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
