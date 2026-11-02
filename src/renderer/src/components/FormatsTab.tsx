/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, AudioLines, Film, Image as ImageIcon, MonitorPlay, X } from 'lucide-react'
import { Badge, Button, Segmented, cx } from './ui'
import { bytes, kbps } from '../lib/format'
import { formatKind, formatSize, type DownloadOptions, type FormatKind } from '../lib/args'
import { t } from '../../../shared/i18n'

type Filter = 'all' | 'av' | 'v' | 'a' | 'other'

const KIND_ICON: Record<FormatKind, React.ReactNode> = {
  av: <MonitorPlay className="h-4 w-4 text-ok" />,
  v: <Film className="h-4 w-4 text-info" />,
  a: <AudioLines className="h-4 w-4 text-warn" />,
  other: <ImageIcon className="h-4 w-4 text-faint" />
}

const KIND_LABEL: Record<FormatKind, string> = {
  av: 'Vídeo + áudio',
  v: 'Só vídeo',
  a: 'Só áudio',
  other: 'Storyboard / outro'
}

interface Col {
  id: string
  label: string
  value: (f: any) => string | number | null
  render?: (f: any) => React.ReactNode
  className?: string
}

const shortCodec = (c?: string) => (!c || c === 'none' ? '' : c)

const COLS: Col[] = [
  { id: 'format_id', label: 'ID', value: (f) => f.format_id, className: 'font-mono text-xs' },
  { id: 'ext', label: 'Ext', value: (f) => f.ext },
  {
    id: 'res',
    label: 'Resolução',
    value: (f) => (f.height ?? 0) * 10000 + (f.width ?? 0),
    render: (f) => (formatKind(f) === 'a' ? <span className="text-muted">{t('áudio')}</span> : f.resolution ?? (f.height ? `${f.height}p` : '—'))
  },
  { id: 'fps', label: 'FPS', value: (f) => f.fps ?? null, render: (f) => (f.fps ? Math.round(f.fps) : '') },
  {
    id: 'hdr',
    label: 'Faixa',
    value: (f) => f.dynamic_range ?? '',
    render: (f) => (f.dynamic_range && f.dynamic_range !== 'SDR' ? <Badge tone="warn">{f.dynamic_range}</Badge> : f.dynamic_range ?? '')
  },
  { id: 'vcodec', label: 'Codec vídeo', value: (f) => shortCodec(f.vcodec), className: 'font-mono text-xs' },
  { id: 'acodec', label: 'Codec áudio', value: (f) => shortCodec(f.acodec), className: 'font-mono text-xs' },
  { id: 'abr', label: 'Áudio', value: (f) => f.abr ?? null, render: (f) => [f.abr ? kbps(f.abr) : '', f.asr ? `${f.asr / 1000} kHz` : '', f.audio_channels ? `${f.audio_channels}ch` : ''].filter(Boolean).join(' · ') },
  { id: 'tbr', label: 'Bitrate', value: (f) => f.tbr ?? null, render: (f) => (f.tbr ? kbps(f.tbr) : '') },
  {
    id: 'size',
    label: 'Tamanho',
    value: (f) => formatSize(f),
    render: (f) => (f.filesize ? bytes(f.filesize) : f.filesize_approx ? `~${bytes(f.filesize_approx)}` : '')
  },
  { id: 'language', label: 'Idioma', value: (f) => f.language ?? '' },
  { id: 'protocol', label: 'Protocolo', value: (f) => f.protocol ?? '', className: 'text-xs text-muted' },
  { id: 'note', label: 'Observação', value: (f) => f.format_note ?? '', className: 'text-xs text-muted' }
]

export default function FormatsTab({
  info,
  opts,
  setOpts
}: {
  info: any
  opts: DownloadOptions
  setOpts: (fn: (o: DownloadOptions) => DownloadOptions) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 }>({ col: '', dir: -1 })
  const formats: any[] = info.formats ?? []

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: formats.length, av: 0, v: 0, a: 0, other: 0 }
    for (const f of formats) c[formatKind(f)]++
    return c
  }, [formats])

  const rows = useMemo(() => {
    let list = formats.map((f, i) => ({ f, i }))
    if (filter !== 'all') list = list.filter(({ f }) => formatKind(f) === filter)
    const col = COLS.find((c) => c.id === sort.col)
    list.sort((a, b) => {
      if (!col) return (b.i - a.i) * (sort.dir === -1 ? 1 : -1)
      const va = col.value(a.f)
      const vb = col.value(b.f)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir
    })
    return list.map((r) => r.f)
  }, [formats, filter, sort])

  const selected = new Set([opts.manualVideo, ...opts.manualAudio].filter(Boolean))
  const byId = (id: string | null) => formats.find((f) => f.format_id === id)

  const toggle = (f: any) => {
    const kind = formatKind(f)
    if (kind === 'other') return
    setOpts((o) => {
      let { manualVideo, manualAudio } = o
      if (kind === 'a') {
        manualAudio = manualAudio.includes(f.format_id) ? manualAudio.filter((x) => x !== f.format_id) : [...manualAudio, f.format_id]
        // um formato que já tem áudio não combina com outra faixa de áudio
        if (manualVideo && formatKind(byId(manualVideo)) === 'av') manualVideo = null
      } else {
        manualVideo = manualVideo === f.format_id ? null : f.format_id
        if (kind === 'av') manualAudio = []
      }
      return { ...o, manualVideo, manualAudio, mode: manualVideo || manualAudio.length ? 'manual' : o.mode === 'manual' ? 'video' : o.mode }
    })
  }

  const selFormats = [opts.manualVideo, ...opts.manualAudio].map(byId).filter(Boolean)
  const total = selFormats.reduce((s, f) => s + (formatSize(f) ?? 0), 0)

  const header = (c: Col) => (
    <th
      key={c.id}
      onClick={() => setSort((s) => ({ col: c.id, dir: s.col === c.id ? (s.dir === 1 ? -1 : 1) : -1 }))}
      className="sticky top-0 cursor-pointer bg-panel-2 px-2.5 py-2 text-left text-xs font-medium whitespace-nowrap text-muted hover:text-text"
    >
      <span className="inline-flex items-center gap-1">
        {t(c.label)}
        {sort.col === c.id && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-[560px] max-w-full">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('Todos ({n})', { n: counts.all }) },
              { value: 'av', label: t('Vídeo+áudio ({n})', { n: counts.av }), disabled: !counts.av },
              { value: 'v', label: t('Só vídeo ({n})', { n: counts.v }), disabled: !counts.v },
              { value: 'a', label: t('Só áudio ({n})', { n: counts.a }), disabled: !counts.a },
              { value: 'other', label: t('Outros ({n})', { n: counts.other }), disabled: !counts.other }
            ]}
          />
        </div>
        <span className="text-xs text-muted">{t('Clique para escolher: 1 vídeo + 1 ou mais áudios, ou 1 formato completo.')}</span>
      </div>

      {selFormats.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm">
          <span className="font-medium">{t('Selecionado:')}</span>
          <span className="font-mono text-xs">{selFormats.map((f) => f.format_id).join(' + ')}</span>
          <span className="text-muted">
            {selFormats.map((f) => `${f.ext} ${formatKind(f) === 'a' ? (f.acodec ?? t('áudio')) : (f.resolution ?? '')}`).join(' · ')}
          </span>
          {total > 0 && <span className="text-muted">≈ {bytes(total)}</span>}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            icon={<X className="h-3.5 w-3.5" />}
            onClick={() => setOpts((o) => ({ ...o, manualVideo: null, manualAudio: [], mode: o.mode === 'manual' ? 'video' : o.mode }))}
          >
            {t('Limpar')}
          </Button>
        </div>
      )}

      <div className="max-h-[62vh] overflow-auto rounded-xl border border-line">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 w-8 bg-panel-2" />
              {COLS.map(header)}
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const kind = formatKind(f)
              const isSel = selected.has(f.format_id)
              return (
                <tr
                  key={f.format_id}
                  onClick={() => toggle(f)}
                  title={`${t(KIND_LABEL[kind])} — ${f.format}`}
                  className={cx(
                    'border-t border-line/60',
                    kind !== 'other' && 'cursor-pointer',
                    isSel ? 'bg-accent/12' : 'hover:bg-panel-2'
                  )}
                >
                  <td className="px-2.5 py-1.5">{KIND_ICON[kind]}</td>
                  {COLS.map((c) => (
                    <td key={c.id} className={cx('px-2.5 py-1.5 whitespace-nowrap', c.className)}>
                      {c.render ? c.render(f) : c.value(f)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
