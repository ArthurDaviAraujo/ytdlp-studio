import { CircleCheck, CircleX, ListVideo, Play, Share2, Trash2, Wand2, X } from 'lucide-react'
import { t } from '../../../src/shared/i18n'
import { engine } from '../native'
import { cancelJob, removeJob, type MJob } from '../jobs'
import { Card, Progress, cx } from '../ui'
import type { Ctx } from '../App'

export default function QueuePage({ ctx, jobs }: { ctx: Ctx; jobs: MJob[] }) {
  if (!jobs.length)
    return (
      <div className="flex flex-col items-center gap-2 px-8 pt-24 text-center text-muted">
        <ListVideo className="h-10 w-10 text-faint" />
        <div className="text-[15px] font-medium text-text">{t('Nada por aqui ainda')}</div>
        <p className="text-[13px]">{t('Os downloads e os vídeos preparados aparecem aqui, com o progresso.')}</p>
      </div>
    )

  return (
    <div className="space-y-3 p-4">
      {jobs.map((j) => {
        const active = j.status === 'running' || j.status === 'queued'
        return (
          <Card key={j.id} className="space-y-2.5 p-3">
            <div className="flex gap-3">
              <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-panel-3">
                {j.thumbnail && <img src={j.thumbnail} alt="" className="h-full w-full object-cover" />}
                {j.kind === 'prepare' && <Wand2 className="absolute right-1 bottom-1 h-4 w-4 rounded bg-black/60 p-0.5 text-warn" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[14px] leading-5 font-medium">{j.title}</div>
                <div className="truncate text-[12px] text-muted">{j.label}</div>
              </div>
            </div>
            {active && (
              <>
                <Progress percent={j.status === 'queued' ? 0 : j.percent} />
                <div className="flex items-center justify-between text-[12px] text-muted">
                  <span className="truncate">{j.stage}</span>
                  <span className="flex items-center gap-3">
                    {j.percent != null && j.status === 'running' && <span className="tabular-nums">{Math.floor(j.percent)}%</span>}
                    <button className="rounded p-1 active:text-err" onClick={() => cancelJob(j.id)}>
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                </div>
              </>
            )}
            {!active && (
              <div className="flex items-center gap-1">
                <span className={cx('flex flex-1 items-center gap-1.5 text-[13px]', j.status === 'done' ? 'text-ok' : j.status === 'error' ? 'text-err' : 'text-muted')}>
                  {j.status === 'done' ? <CircleCheck className="h-4 w-4" /> : <CircleX className="h-4 w-4" />}
                  <span className="truncate">{j.status === 'error' ? j.error ?? t('Erro') : j.stage}</span>
                </span>
                {j.status === 'done' && j.uri && (
                  <>
                    <button className="rounded-lg p-2 text-muted active:text-text" title={t('Abrir')} onClick={() => engine.open({ uri: j.uri!, mime: j.mime })}>
                      <Play className="h-5 w-5" />
                    </button>
                    <button className="rounded-lg p-2 text-muted active:text-text" title={t('Compartilhar')} onClick={() => engine.share({ uri: j.uri!, mime: j.mime })}>
                      <Share2 className="h-5 w-5" />
                    </button>
                    {j.mime.startsWith('video') && j.file && (
                      <button className="rounded-lg p-2 text-muted active:text-warn" title={t('Preparar')} onClick={() => ctx.prepareFile(j.file!, j.file!.split('/').pop() ?? j.title)}>
                        <Wand2 className="h-5 w-5" />
                      </button>
                    )}
                  </>
                )}
                <button className="rounded-lg p-2 text-muted active:text-err" title={t('Tirar da lista')} onClick={() => removeJob(j.id)}>
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
