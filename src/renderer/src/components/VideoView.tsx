/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, type ReactNode } from 'react'
import { BadgeCheck, Calendar, Clock, Copy, Eye, ExternalLink, MessageSquare, Radio, ThumbsUp, Users } from 'lucide-react'
import { Badge, Button, Card, Tabs } from './ui'
import { compact, duration, epoch, num, ymd } from '../lib/format'
import type { DownloadOptions } from '../lib/args'
import FormatsTab from './FormatsTab'
import SubtitlesTab from './SubtitlesTab'
import ChaptersTab from './ChaptersTab'
import CommentsTab from './CommentsTab'

export type VideoTab = 'overview' | 'formats' | 'subs' | 'thumbs' | 'chapters' | 'comments' | 'json'

const LIVE: Record<string, string> = {
  is_live: 'Ao vivo agora',
  is_upcoming: 'Estreia agendada',
  was_live: 'Foi transmitido ao vivo',
  post_live: 'Ao vivo encerrado (processando)'
}

const AVAILABILITY: Record<string, string> = {
  public: 'Público',
  unlisted: 'Não listado',
  private: 'Privado',
  premium_only: 'Somente Premium',
  subscriber_only: 'Somente membros',
  needs_auth: 'Exige login'
}

export const thumbOf = (info: any): string | null =>
  info?.thumbnail ?? [...(info?.thumbnails ?? [])].reverse().find((t: any) => t.url)?.url ?? null

function Stat({ icon, children, title }: { icon: ReactNode; children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1.5 text-sm text-muted">
      {icon}
      <span className="text-text">{children}</span>
    </span>
  )
}

export function VideoHeader({ info }: { info: any }) {
  const thumb = thumbOf(info)
  const channel = info.channel ?? info.uploader ?? info.creator
  return (
    <div className="flex gap-5">
      {thumb && (
        <div className="relative w-[300px] shrink-0 self-start">
          <img src={thumb} alt="" className="aspect-video w-full rounded-xl border border-line object-cover" />
          {info.duration != null && (
            <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium">{duration(info.duration)}</span>
          )}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-3">
        <h1 className="selectable text-xl leading-snug font-semibold">{info.title}</h1>
        {channel && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <a
              href={info.channel_url ?? info.uploader_url ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-text hover:underline"
            >
              {channel}
              {info.channel_is_verified && <BadgeCheck className="h-4 w-4 text-muted" />}
            </a>
            {info.channel_follower_count != null && (
              <Stat icon={<Users className="h-3.5 w-3.5" />}>{compact(info.channel_follower_count)} inscritos</Stat>
            )}
            {info.uploader_id && <span className="text-muted">{info.uploader_id}</span>}
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {info.view_count != null && (
            <Stat icon={<Eye className="h-4 w-4" />} title={num(info.view_count)}>
              {compact(info.view_count)} visualizações
            </Stat>
          )}
          {info.like_count != null && (
            <Stat icon={<ThumbsUp className="h-4 w-4" />} title={num(info.like_count)}>
              {compact(info.like_count)}
            </Stat>
          )}
          {info.comment_count != null && (
            <Stat icon={<MessageSquare className="h-4 w-4" />} title={num(info.comment_count)}>
              {compact(info.comment_count)} comentários
            </Stat>
          )}
          {info.upload_date && <Stat icon={<Calendar className="h-4 w-4" />}>{ymd(info.upload_date)}</Stat>}
          {info.duration != null && <Stat icon={<Clock className="h-4 w-4" />}>{duration(info.duration)}</Stat>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="info">{info.extractor_key ?? info.extractor}</Badge>
          {info.live_status && LIVE[info.live_status] && (
            <Badge tone="accent">
              <Radio className="h-3 w-3" />
              {LIVE[info.live_status]}
            </Badge>
          )}
          {info.availability && <Badge>{AVAILABILITY[info.availability] ?? info.availability}</Badge>}
          {info.age_limit ? <Badge tone="warn">+{info.age_limit}</Badge> : null}
          {info._has_drm && <Badge tone="err">DRM</Badge>}
          {info.resolution && <Badge>{info.resolution}</Badge>}
          {info.dynamic_range && info.dynamic_range !== 'SDR' && <Badge tone="warn">{info.dynamic_range}</Badge>}
        </div>
        <div className="flex gap-2 pt-1">
          <Button size="sm" icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => window.api.openExternal(info.webpage_url)}>
            Abrir no navegador
          </Button>
          <Button size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => window.api.writeClipboard(info.webpage_url)}>
            Copiar link
          </Button>
        </div>
      </div>
    </div>
  )
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="text-info hover:underline">
            {p}
          </a>
        ) : (
          p
        )
      )}
    </>
  )
}

function Heatmap({ data, total }: { data: any[]; total: number }) {
  const w = 1000
  const h = 70
  const points = data.map((d) => `${(((d.start_time + d.end_time) / 2) / total) * w},${h - d.value * (h - 4)}`)
  const path = `M0,${h} L${points.join(' L')} L${w},${h} Z`
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0])
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-16 w-full">
        <path d={path} fill="rgba(255,77,77,0.18)" stroke="#ff4d4d" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>0:00</span>
        <span>
          Pico em {duration(peak.start_time)}–{duration(peak.end_time)}
        </span>
        <span>{duration(total)}</span>
      </div>
    </div>
  )
}

const SKIP_FIELDS = new Set([
  'formats',
  'thumbnails',
  'subtitles',
  'automatic_captions',
  'chapters',
  'heatmap',
  'requested_formats',
  'requested_downloads',
  'requested_subtitles',
  'description',
  'entries',
  'comments',
  'http_headers',
  '_format_sort_fields'
])

const PRETTY: Record<string, (v: any) => string> = {
  duration: duration,
  upload_date: ymd,
  release_date: ymd,
  modified_date: ymd,
  timestamp: epoch,
  release_timestamp: epoch,
  modified_timestamp: epoch,
  epoch: epoch,
  view_count: num,
  like_count: num,
  comment_count: num,
  channel_follower_count: num
}

function fieldValue(v: any): string {
  if (v == null) return 'null'
  if (Array.isArray(v)) return v.every((x) => typeof x !== 'object') ? v.join(', ') : JSON.stringify(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function OverviewTab({ info }: { info: any }) {
  const [expanded, setExpanded] = useState(false)
  const desc: string = info.description ?? ''
  const long = desc.length > 600 || desc.split('\n').length > 8
  const fields = useMemo(() => Object.entries(info).filter(([k]) => !SKIP_FIELDS.has(k)), [info])
  return (
    <div className="space-y-4">
      <Card title="Descrição">
        {desc ? (
          <>
            <div className={`selectable text-sm leading-relaxed whitespace-pre-wrap ${!expanded && long ? 'line-clamp-8' : ''}`}>
              <Linkified text={desc} />
            </div>
            {long && (
              <button className="mt-2 text-sm font-medium text-info hover:underline" onClick={() => setExpanded(!expanded)}>
                {expanded ? 'Mostrar menos' : 'Mostrar tudo'}
              </button>
            )}
          </>
        ) : (
          <span className="text-sm text-muted">Sem descrição.</span>
        )}
      </Card>

      {(info.tags?.length > 0 || info.categories?.length > 0) && (
        <Card title="Categorias e tags">
          <div className="flex flex-wrap gap-1.5">
            {info.categories?.map((c: string) => (
              <Badge key={'c' + c} tone="info">
                {c}
              </Badge>
            ))}
            {info.tags?.map((t: string) => (
              <Badge key={'t' + t}>#{t}</Badge>
            ))}
          </div>
        </Card>
      )}

      {info.heatmap?.length > 0 && info.duration && (
        <Card title="Partes mais assistidas">
          <Heatmap data={info.heatmap} total={info.duration} />
        </Card>
      )}

      <Card title={`Todos os campos (${fields.length})`}>
        <div className="selectable grid grid-cols-[minmax(160px,220px)_1fr] gap-x-4 text-sm">
          {fields.map(([k, v]) => (
            <div key={k} className="contents">
              <div className="border-b border-line/60 py-1.5 font-mono text-xs text-muted">{k}</div>
              <div className="border-b border-line/60 py-1.5 break-all">
                {fieldValue(v)}
                {PRETTY[k] && v != null && <span className="ml-2 text-xs text-muted">({PRETTY[k](v)})</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function ThumbnailsTab({ info }: { info: any }) {
  const thumbs = [...(info.thumbnails ?? [])].reverse()
  if (!thumbs.length) return <div className="py-10 text-center text-muted">Nenhuma miniatura disponível.</div>
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
      {thumbs.map((t: any) => (
        <button
          key={t.id ?? t.url}
          onClick={() => window.api.openExternal(t.url)}
          className="group overflow-hidden rounded-xl border border-line bg-panel text-left hover:border-[#3a4357]"
          title="Abrir no navegador"
        >
          <div className="aspect-video bg-panel-3">
            <img src={t.url} alt="" loading="lazy" className="h-full w-full object-contain" onError={(e) => (e.currentTarget.style.opacity = '0.15')} />
          </div>
          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="font-medium">{t.width && t.height ? `${t.width}×${t.height}` : t.resolution ?? 'tamanho desconhecido'}</span>
            <span className="text-muted">id {t.id ?? '—'}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

function JsonTab({ info }: { info: any }) {
  const text = useMemo(() => JSON.stringify(info, null, 2), [info])
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">
          Resposta completa do yt-dlp (<code>-J</code>), {num(text.length)} caracteres.
        </span>
        <Button size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => window.api.writeClipboard(text)}>
          Copiar JSON
        </Button>
      </div>
      <pre className="max-h-[70vh] overflow-auto rounded-xl border border-line bg-panel p-4 font-mono text-xs leading-5">{text}</pre>
    </div>
  )
}

export default function VideoView({
  info,
  tab,
  setTab,
  opts,
  setOpts
}: {
  info: any
  tab: VideoTab
  setTab: (t: VideoTab) => void
  opts: DownloadOptions
  setOpts: (fn: (o: DownloadOptions) => DownloadOptions) => void
}) {
  const subs = Object.keys(info.subtitles ?? {}).length
  const auto = Object.keys(info.automatic_captions ?? {}).length
  return (
    <div className="space-y-5">
      <VideoHeader info={info} />
      <Tabs<VideoTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Visão geral' },
          { id: 'formats', label: 'Formatos', count: info.formats?.length ?? 0 },
          { id: 'subs', label: 'Legendas', count: subs + auto },
          { id: 'thumbs', label: 'Miniaturas', count: info.thumbnails?.length ?? 0 },
          { id: 'chapters', label: 'Capítulos', count: info.chapters?.length ?? 0 },
          { id: 'comments', label: 'Comentários', count: info.comment_count ?? null },
          { id: 'json', label: 'JSON' }
        ]}
      />
      {tab === 'overview' && <OverviewTab info={info} />}
      {tab === 'formats' && <FormatsTab info={info} opts={opts} setOpts={setOpts} />}
      {tab === 'subs' && <SubtitlesTab info={info} opts={opts} setOpts={setOpts} />}
      {tab === 'thumbs' && <ThumbnailsTab info={info} />}
      {tab === 'chapters' && <ChaptersTab info={info} opts={opts} setOpts={setOpts} />}
      {tab === 'comments' && <CommentsTab info={info} />}
      {tab === 'json' && <JsonTab info={info} />}
    </div>
  )
}
