/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react'
import { Plus, Scissors, X } from 'lucide-react'
import { Button, Card, Checkbox, TextInput, Toggle, cx } from './ui'
import { duration, parseTime } from '../lib/format'
import type { DownloadOptions } from '../lib/args'
import { t } from '../../../shared/i18n'

const chapterSection = (c: any) => `*${c.start_time}-${c.end_time}`

export default function ChaptersTab({
  info,
  opts,
  setOpts
}: {
  info: any
  opts: DownloadOptions
  setOpts: (fn: (o: DownloadOptions) => DownloadOptions) => void
}) {
  const chapters: any[] = info.chapters ?? []
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [regex, setRegex] = useState('')
  const sel = new Set(opts.sections)

  const toggle = (s: string) =>
    setOpts((o) => ({ ...o, sections: o.sections.includes(s) ? o.sections.filter((x) => x !== s) : [...o.sections, s] }))

  const fromS = parseTime(from)
  const toS = to.trim().toLowerCase() === 'fim' || !to.trim() ? 'inf' : parseTime(to)
  const validRange = fromS != null && toS != null && (toS === 'inf' || toS > fromS)

  const addRange = () => {
    if (!validRange) return
    toggle(`*${fromS}-${toS}`)
    setFrom('')
    setTo('')
  }

  const describe = (s: string) => {
    const c = chapters.find((x) => chapterSection(x) === s)
    if (c) return t('Capítulo: {title}', { title: c.title })
    const m = s.match(/^\*([\d.]+)-([\d.]+|inf)$/)
    if (m) return t('Trecho {from} até {to}', { from: duration(Number(m[1])), to: m[2] === 'inf' ? t('o fim') : duration(Number(m[2])) })
    return t('Capítulos que combinam com /{re}/', { re: s })
  }

  return (
    <div className="space-y-4">
      <Card
        title={t('Capítulos ({n})', { n: chapters.length })}
        actions={
          chapters.length > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpts((o) => ({ ...o, sections: [...new Set([...o.sections, ...chapters.map(chapterSection)])] }))}>
                {t('Marcar todos')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpts((o) => ({ ...o, sections: o.sections.filter((s) => !chapters.some((c) => chapterSection(c) === s)) }))}>
                {t('Desmarcar')}
              </Button>
            </div>
          )
        }
      >
        {chapters.length ? (
          <div className="space-y-0.5">
            <p className="mb-2 text-xs text-muted">{t('Marcando capítulos, só essas partes são baixadas (--download-sections).')}</p>
            {chapters.map((c, i) => {
              const s = chapterSection(c)
              return (
                <label key={i} className={cx('flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5', sel.has(s) ? 'bg-accent/10' : 'hover:bg-panel-2')}>
                  <Checkbox checked={sel.has(s)} onChange={() => toggle(s)} />
                  <span className="w-28 font-mono text-xs text-muted">
                    {duration(c.start_time)} – {duration(c.end_time)}
                  </span>
                  <span className="flex-1 text-sm">{c.title}</span>
                  <span className="text-xs text-faint">{duration(c.end_time - c.start_time)}</span>
                </label>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted">{t('Este vídeo não tem capítulos. Você ainda pode baixar só um trecho abaixo.')}</p>
        )}
      </Card>

      <Card title={t('Baixar só um trecho')}>
        <div className="flex items-end gap-3">
          <div className="w-40">
            <div className="mb-1.5 text-xs text-muted">{t('Início')}</div>
            <TextInput value={from} onChange={(e) => setFrom(e.target.value)} placeholder="1:30" onKeyDown={(e) => e.key === 'Enter' && addRange()} />
          </div>
          <div className="w-40">
            <div className="mb-1.5 text-xs text-muted">{t('Fim (vazio = até o fim)')}</div>
            <TextInput value={to} onChange={(e) => setTo(e.target.value)} placeholder="2:45" onKeyDown={(e) => e.key === 'Enter' && addRange()} />
          </div>
          <Button icon={<Plus className="h-4 w-4" />} disabled={!validRange} onClick={addRange}>
            {t('Adicionar trecho')}
          </Button>
        </div>
        <div className="mt-4 flex items-end gap-3">
          <div className="w-[332px]">
            <div className="mb-1.5 text-xs text-muted">{t('Ou capítulos cujo título combine com (regex)')}</div>
            <TextInput value={regex} onChange={(e) => setRegex(e.target.value)} placeholder={t('intro|refrão')} />
          </div>
          <Button
            icon={<Plus className="h-4 w-4" />}
            disabled={!regex.trim()}
            onClick={() => {
              toggle(regex.trim())
              setRegex('')
            }}
          >
            {t('Adicionar')}
          </Button>
        </div>
      </Card>

      {opts.sections.length > 0 && (
        <Card title={t('Trechos que serão baixados ({n})', { n: opts.sections.length })} actions={<Button size="sm" variant="ghost" onClick={() => setOpts((o) => ({ ...o, sections: [] }))}>{t('Limpar')}</Button>}>
          <div className="space-y-1.5">
            {opts.sections.map((s) => (
              <div key={s} className="flex items-center gap-3 rounded-lg bg-panel-2 px-3 py-2 text-sm">
                <Scissors className="h-4 w-4 text-accent" />
                <span className="flex-1">{describe(s)}</span>
                <code className="text-xs text-muted">{s}</code>
                <button className="text-muted hover:text-err" onClick={() => toggle(s)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Toggle
              checked={opts.forceKeyframes}
              onChange={(v) => setOpts((o) => ({ ...o, forceKeyframes: v }))}
              label={t('Cortar no tempo exato')}
              hint={t('Recodifica perto dos cortes (--force-keyframes-at-cuts). Mais lento, porém sem sobras.')}
            />
          </div>
        </Card>
      )}
    </div>
  )
}
