import { useEffect, useRef, useState } from 'react'
import { CircleCheck, CircleX, Copy, FileText, FolderOpen, ListVideo, Music, Play, RotateCcw, Scissors, ScrollText, Trash2, TriangleAlert, Wand2, X } from 'lucide-react'
import type { Job } from '../../../shared/types'
import type { AppContext } from '../App'
import { Badge, Button, Empty, ProgressBar, cx } from '../components/ui'
import { bytes, duration, speed } from '../lib/format'
import { quoteArg } from '../lib/args'
import { locale, t } from '../../../shared/i18n'

const STATUS: Record<Job['status'], { label: string; tone: 'neutral' | 'accent' | 'ok' | 'warn' | 'err' | 'info' }> = {
  queued: { label: 'Na fila', tone: 'neutral' },
  running: { label: 'Baixando', tone: 'info' },
  converting: { label: 'Convertendo', tone: 'info' },
  done: { label: 'Concluído', tone: 'ok' },
  error: { label: 'Erro', tone: 'err' },
  canceled: { label: 'Cancelado', tone: 'neutral' }
}

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p
const isVideo = (p: string) => /\.(mp4|mkv|webm|mov|avi|m4v|ts|flv)$/i.test(p)

function LogView({ job }: { job: Job }) {
  const [lines, setLines] = useState<string[]>([])
  const ref = useRef<HTMLPreElement>(null)
  const live = job.status === 'running' || job.status === 'converting'
  useEffect(() => {
    let alive = true
    const load = () => window.api.getJobLog(job.id).then((l) => alive && setLines(l))
    void load()
    if (!live) return () => void (alive = false)
    const t = setInterval(load, 1000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [job.id, live])
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines])
  return (
    <pre ref={ref} className="max-h-72 overflow-auto rounded-lg bg-bg p-3 font-mono text-[11px] leading-[17px] whitespace-pre-wrap break-all text-muted">
      {lines.map((l, i) => (
        <div key={i} className={cx(l.startsWith('ERROR') && 'text-err', l.startsWith('WARNING') && 'text-warn', l.startsWith('[app]') && 'text-info')}>
          {l}
        </div>
      ))}
    </pre>
  )
}

function JobCard({ job, onRemoved, onPrepare, onEdit }: { job: Job; onRemoved: (ids: string[]) => void; onPrepare: (file: string) => void; onEdit: (file: string) => void }) {
  const [showLog, setShowLog] = useState(false)
  const st = STATUS[job.status]
  const active = job.status === 'running' || job.status === 'converting'
  const details = !active ? [] : [
    job.percent != null ? `${job.percent.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : null,
    job.downloadedBytes != null ? (job.totalBytes ? t('{done} de {total}', { done: bytes(job.downloadedBytes), total: bytes(job.totalBytes) }) : bytes(job.downloadedBytes)) : null,
    job.speed != null ? speed(job.speed) : null,
    job.eta != null ? t('faltam {time}', { time: duration(job.eta) }) : null,
    job.fragment ? t('fragmento {n}', { n: job.fragment }) : null
  ].filter(Boolean)

  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex gap-4">
        <div className="h-[72px] w-32 shrink-0 overflow-hidden rounded-lg bg-panel-3">
          {job.thumbnail ? <img src={job.thumbnail} alt="" className="h-full w-full object-cover" /> : <ListVideo className="m-auto mt-6 h-6 w-6 text-faint" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium" title={job.title}>
                {job.title}
              </div>
              <div className="truncate text-xs text-muted">{job.label}</div>
            </div>
            <Badge tone={st.tone}>
              {job.status === 'done' && <CircleCheck className="h-3 w-3" />}
              {job.status === 'error' && <CircleX className="h-3 w-3" />}
              {t(st.label)}
            </Badge>
          </div>

          {(active || job.status === 'queued') && <ProgressBar percent={job.status === 'queued' ? 0 : job.percent} tone={job.status === 'converting' ? 'info' : 'accent'} />}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {job.item && (
              <span className="text-text">
                {t('Item {i} de {n}', { i: job.item.index, n: job.item.count })}: {job.item.title}
              </span>
            )}
            <span>{t(job.stage)}</span>
            {details.length > 0 && <span>{details.join(' · ')}</span>}
            {job.warnings > 0 && (
              <span className="inline-flex items-center gap-1 text-warn">
                <TriangleAlert className="h-3 w-3" /> {job.warnings > 1 ? t('{n} avisos', { n: job.warnings }) : t('1 aviso')}
              </span>
            )}
          </div>

          {job.error && <div className="selectable rounded-lg bg-err/10 px-3 py-2 text-xs whitespace-pre-wrap text-err">{job.error}</div>}

          {job.files.length > 0 && (
            <div className="space-y-1">
              {job.files.map((f) => (
                <div key={f} className="flex items-center gap-2 rounded-lg bg-panel-2 px-3 py-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
                  <span className="selectable min-w-0 flex-1 truncate" title={f}>
                    {baseName(f)}
                  </span>
                  <button className="flex items-center gap-1 text-muted hover:text-text" onClick={() => window.api.openPath(f)}>
                    <Play className="h-3.5 w-3.5" />{t(' Abrir')}
                  </button>
                  <button className="flex items-center gap-1 text-muted hover:text-text" onClick={() => window.api.showInFolder(f)}>
                    <FolderOpen className="h-3.5 w-3.5" />{t(' Pasta')}
                  </button>
                  {job.status === 'done' && isVideo(f) && (
                    <button className="flex items-center gap-1 text-muted hover:text-text" onClick={() => onEdit(f)}>
                      <Scissors className="h-3.5 w-3.5" />{t(' Editar')}
                    </button>
                  )}
                  {job.status === 'done' && isVideo(f) && (
                    <button className="flex items-center gap-1 text-muted hover:text-text" onClick={() => onPrepare(f)}>
                      <Wand2 className="h-3.5 w-3.5" />{t(' Preparar')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {(active || job.status === 'queued') && (
              <Button size="sm" variant="danger" icon={<X className="h-3.5 w-3.5" />} onClick={() => window.api.cancelJob(job.id)}>
                {t('Cancelar')}
              </Button>
            )}
            {(job.status === 'error' || job.status === 'canceled' || job.status === 'done') && (
              <Button size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => window.api.retryJob(job.id)}>
                {job.status !== 'done' ? t('Tentar de novo') : job.kind === 'convert' ? t('Converter de novo') : job.kind === 'download' ? t('Baixar de novo') : t('Fazer de novo')}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<ScrollText className="h-3.5 w-3.5" />} onClick={() => setShowLog(!showLog)}>
              {showLog ? t('Esconder log') : t('Ver log')}
            </Button>
            {job.command.length > 0 && (
              <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => window.api.writeClipboard(job.command.map(quoteArg).join(' '))}>
                {t('Copiar comando')}
              </Button>
            )}
            {!active && (
              <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => window.api.removeJob(job.id).then(onRemoved)}>
                {t('Remover da lista')}
              </Button>
            )}
          </div>
          {showLog && <LogView job={job} />}
        </div>
      </div>
    </div>
  )
}

export default function QueuePage({ ctx, jobs, onRemoved }: { ctx: AppContext; jobs: Job[]; onRemoved: (ids: string[]) => void }) {
  const sorted = [...jobs].sort((a, b) => b.createdAt - a.createdAt)
  const active = jobs.filter((j) => j.status === 'running' || j.status === 'converting').length
  const queued = jobs.filter((j) => j.status === 'queued').length
  const finished = jobs.filter((j) => j.status === 'done' || j.status === 'error' || j.status === 'canceled').length

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] space-y-4 p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{t('Downloads')}</h1>
            <p className="text-sm text-muted">
              {active}{t(' baixando · ')}{queued}{t(' na fila · ')}{finished}{t(' finalizados · até ')}{ctx.settings.concurrency}{t(' ao mesmo tempo')}
            </p>
          </div>
          <Button icon={<FolderOpen className="h-4 w-4" />} onClick={() => window.api.openPath(ctx.settings.downloadDir)}>
            {t('Pasta dos vídeos')}
          </Button>
          {ctx.settings.audioDir && ctx.settings.audioDir !== ctx.settings.downloadDir && (
            <Button icon={<Music className="h-4 w-4" />} onClick={() => window.api.openPath(ctx.settings.audioDir)}>
              {t('Pasta das músicas')}
            </Button>
          )}
          <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} disabled={!finished} onClick={() => window.api.clearFinished().then(onRemoved)}>
            {t('Limpar finalizados')}
          </Button>
        </div>
        {sorted.length === 0 ? (
          <Empty icon={<ListVideo className="h-8 w-8" />} title={t('Nenhum download ainda')}>
            {t('Analise um link na aba Baixar e clique em Baixar.')}
          </Empty>
        ) : (
          sorted.map((j) => <JobCard key={j.id} job={j} onRemoved={onRemoved} onPrepare={ctx.openExport} onEdit={ctx.openEditor} />)
        )}
      </div>
    </div>
  )
}
