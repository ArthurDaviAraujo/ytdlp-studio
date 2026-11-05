import { useEffect, useState } from 'react'
import { CheckCircle2, Download, Trash2 } from 'lucide-react'
import { t } from '../../src/shared/i18n'
import { engine } from './native'
import { MOBILE_PACKS, installPack, packInstalled, packSize, removePack, type MobilePack } from './packs'
import { Button, Progress } from './ui'

const mb = (n: number) => `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1)} MB`

/** Situação de um modelo de IA: baixado, baixando ou com o botão de baixar */
export function usePack(id: MobilePack['id']) {
  const pack = MOBILE_PACKS.find((p) => p.id === id)!
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void packInstalled(pack).then(setInstalled)
    // O mesmo download aparece em todas as telas que mostram esta IA; no fim, todas relêem se está instalada
    const sub = engine.addListener('progress', (e) => {
      if (e.id !== `pack-${id}` || e.percent == null) return
      if (e.percent >= 100) {
        setProgress(null)
        void packInstalled(pack).then(setInstalled)
      } else setProgress(e.percent)
    })
    return () => void sub.then((h) => h.remove())
  }, [id, pack])
  const install = async () => {
    setError(null)
    setProgress(0)
    const err = await installPack(pack)
    setProgress(null)
    if (err) setError(err)
    setInstalled(await packInstalled(pack))
  }
  const remove = async () => {
    await removePack(pack)
    setInstalled(await packInstalled(pack))
  }
  return { pack, installed, progress, error, install, remove }
}

/** Linha com o botão "Baixar (X MB)" ou a barra de progresso, para usar dentro das seções */
export function PackInline({ id, vulkan }: { id: MobilePack['id']; vulkan: boolean }) {
  const p = usePack(id)
  if (!vulkan) return <p className="rounded-xl bg-warn/10 px-3 py-2 text-[13px] text-warn">{t('A placa deste celular não tem Vulkan; esta IA não roda aqui.')}</p>
  if (p.installed) return null
  return (
    <div className="space-y-2 rounded-xl bg-panel-2 p-3">
      <p className="text-[13px] text-muted">{t(p.pack.hint)}</p>
      {p.progress != null ? (
        <Progress percent={p.progress} />
      ) : (
        <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={p.install}>
          {t('Baixar a IA')} ({mb(packSize(p.pack))})
        </Button>
      )}
      {p.error && <p className="text-[13px] text-err">{p.error}</p>}
    </div>
  )
}

/** Linha da lista em Ajustes */
export function PackRow({ id }: { id: MobilePack['id'] }) {
  const p = usePack(id)
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px]">
          {p.installed && <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />}
          {t(p.pack.name)}
        </div>
        <div className="text-[13px] text-muted">
          {t(p.pack.hint)} · {mb(packSize(p.pack))}
        </div>
        {p.progress != null && (
          <div className="mt-2">
            <Progress percent={p.progress} />
          </div>
        )}
        {p.error && <div className="mt-1 text-[13px] text-err">{p.error}</div>}
      </div>
      {p.installed ? (
        <button className="rounded-lg p-2 text-muted active:text-err" onClick={p.remove} title={t('Apagar')}>
          <Trash2 className="h-5 w-5" />
        </button>
      ) : (
        p.progress == null && (
          <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={p.install}>
            {t('Baixar')}
          </Button>
        )
      )}
    </div>
  )
}
