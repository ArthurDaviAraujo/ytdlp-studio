/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react'
import { ExternalLink, Info, ListVideo } from 'lucide-react'
import { Badge, Button, Checkbox, cx } from './ui'
import { compact, duration, ymd } from '../lib/format'
import type { DownloadOptions } from '../lib/args'
import { thumbOf } from './VideoView'
import { t } from '../../../shared/i18n'

/** "1,3,5-7" → [1,3,5,6,7] */
function parseItems(s: string, count: number): Set<number> {
  const out = new Set<number>()
  if (!s.trim()) {
    for (let i = 1; i <= count; i++) out.add(i)
    return out
  }
  for (const part of s.split(',')) {
    const [a, b] = part.split('-').map((x) => Number(x.trim()))
    if (!isNaN(a) && !isNaN(b)) for (let i = a; i <= b; i++) out.add(i)
    else if (!isNaN(a)) out.add(a)
  }
  return out
}

function toItems(sel: Set<number>, count: number): string {
  if (sel.size === count) return ''
  const sorted = [...sel].sort((a, b) => a - b)
  const ranges: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]
    while (sorted[i + 1] === sorted[i] + 1) i++
    ranges.push(start === sorted[i] ? String(start) : `${start}-${sorted[i]}`)
  }
  return ranges.join(',')
}

export default function PlaylistView({
  info,
  opts,
  setOpts,
  onOpenEntry
}: {
  info: any
  opts: DownloadOptions
  setOpts: (fn: (o: DownloadOptions) => DownloadOptions) => void
  onOpenEntry: (url: string) => void
}) {
  const entries: any[] = info.entries ?? []
  const count = entries.length
  const sel = useMemo(() => parseItems(opts.playlistItems, count), [opts.playlistItems, count])
  const totalDuration = entries.reduce((s, e) => s + (e.duration ?? 0), 0)
  const thumb = thumbOf(info) ?? thumbOf(entries[0])

  const setSel = (next: Set<number>) => setOpts((o) => ({ ...o, playlistItems: next.size ? toItems(next, count) : '0' }))
  const toggle = (i: number) => {
    const next = new Set(sel)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSel(next)
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-5">
        {thumb && <img src={thumb} alt="" className="aspect-video w-[300px] shrink-0 rounded-xl border border-line object-cover" />}
        <div className="min-w-0 flex-1 space-y-3">
          <Badge tone="info">
            <ListVideo className="h-3 w-3" />{t(' Playlist · ')}{info.extractor_key}
          </Badge>
          <h1 className="selectable text-xl leading-snug font-semibold">{info.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {(info.channel ?? info.uploader) && <span className="text-text">{info.channel ?? info.uploader}</span>}
            <span>{count}{t(' vídeos')}</span>
            {totalDuration > 0 && <span>{duration(totalDuration)}{t(' no total')}</span>}
            {info.view_count != null && <span>{compact(info.view_count)}{t(' visualizações')}</span>}
            {info.modified_date && <span>{t('atualizada em ')}{ymd(info.modified_date)}</span>}
          </div>
          {info.description && <p className="selectable line-clamp-3 text-sm whitespace-pre-wrap text-muted">{info.description}</p>}
          <Button size="sm" icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => window.api.openExternal(info.webpage_url)}>
            {t('Abrir no navegador')}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-panel">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Checkbox
            checked={sel.size === count}
            onChange={(v) => setSel(v ? new Set(entries.map((_, i) => i + 1)) : new Set())}
          />
          <span className="text-sm font-semibold">
            {sel.size}{t(' de ')}{count}{t(' selecionados')}
          </span>
          {opts.playlistItems && opts.playlistItems !== '0' && (
            <code className="text-xs text-muted">--playlist-items {opts.playlistItems}</code>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {entries.map((e, i) => {
            const idx = i + 1
            const thumb = thumbOf(e)
            return (
              <div
                key={e.id ?? idx}
                onClick={() => toggle(idx)}
                className={cx('flex cursor-pointer items-center gap-3 border-b border-line/50 px-4 py-2', sel.has(idx) ? 'bg-accent/8' : 'hover:bg-panel-2')}
              >
                <Checkbox checked={sel.has(idx)} onChange={() => toggle(idx)} />
                <span className="w-8 text-right text-xs text-muted">{idx}</span>
                <div className="relative h-[54px] w-24 shrink-0 overflow-hidden rounded-md bg-panel-3">
                  {thumb && <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  {e.duration != null && <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-[10px]">{duration(e.duration)}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{e.title ?? e.url}</div>
                  <div className="truncate text-xs text-muted">
                    {[e.channel ?? e.uploader, e.view_count != null ? t('{n} visualizações', { n: compact(e.view_count) }) : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {e.url && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Info className="h-3.5 w-3.5" />}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      onOpenEntry(e.url)
                    }}
                  >
                    {t('Detalhes')}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
