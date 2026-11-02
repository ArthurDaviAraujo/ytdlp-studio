import { useEffect, useMemo, useState } from 'react'
import { Lock, Plus, Search, Trash2, X } from 'lucide-react'
import type { HelpData, HelpOption } from '../../../shared/types'
import { Badge, Button, Checkbox, Spinner, TextInput, cx } from './ui'
import type { AdvancedState, AdvancedValue } from '../lib/args'
import { getLang, t } from '../../../shared/i18n'

const SECTION_PT: Record<string, string> = {
  'General Options': 'Gerais',
  'Network Options': 'Rede',
  'Geo-restriction': 'Restrição geográfica',
  'Video Selection': 'Seleção de vídeos',
  'Download Options': 'Download',
  'Filesystem Options': 'Arquivos e pastas',
  'Thumbnail Options': 'Miniaturas',
  'Internet Shortcut Options': 'Atalhos de internet',
  'Verbosity and Simulation Options': 'Saída e simulação',
  Workarounds: 'Contornos',
  'Video Format Options': 'Formato do vídeo',
  'Subtitle Options': 'Legendas',
  'Authentication Options': 'Autenticação',
  'Post-Processing Options': 'Pós-processamento',
  'SponsorBlock Options': 'SponsorBlock',
  'Extractor Options': 'Extratores',
  'Preset Aliases': 'Predefinições (-t)'
}

// Em inglês fica o nome original da seção, que vem do próprio yt-dlp
const sectionName = (title: string) => (getLang() === 'pt' ? (SECTION_PT[title] ?? title) : title)

const emptyTuple = (o: HelpOption) => o.metavars.map(() => '')

function OptionRow({ o, value, onChange }: { o: HelpOption; value: AdvancedValue | undefined; onChange: (v: AdvancedValue | undefined) => void }) {
  const on = !!value?.on
  const values = value?.values ?? []
  const enable = (v: boolean) => {
    if (!v) return onChange(undefined)
    onChange({ on: true, values: o.metavars.length ? (values.length ? values : [emptyTuple(o)]) : [] })
  }
  const setTuple = (i: number, j: number, text: string) => {
    const next = values.map((t) => [...t])
    next[i][j] = text
    onChange({ on: true, values: next })
  }
  return (
    <div className={cx('rounded-lg border px-4 py-3', on ? 'border-accent/40 bg-accent/5' : 'border-transparent hover:bg-panel-2', o.managed && 'opacity-55')}>
      <div className="flex items-start gap-3">
        {o.managed ? (
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
        ) : (
          <Checkbox checked={on} onChange={enable} className="mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {o.flags.map((f) => (
              <code key={f} className="text-[13px] font-semibold text-text">
                {f}
              </code>
            ))}
            {o.metavars.map((m) => (
              <code key={m} className="text-xs text-info">
                {m}
              </code>
            ))}
            {o.repeatable && <Badge>{t('pode repetir')}</Badge>}
            {o.managed && <Badge tone="warn">{t(o.managed)}</Badge>}
          </div>
          <p className="selectable mt-1 text-[13px] leading-5 text-muted">{o.description}</p>
          {on && o.metavars.length > 0 && (
            <div className="mt-2.5 space-y-2">
              {values.map((tuple, i) => (
                <div key={i} className="flex items-center gap-2">
                  {tuple.map((v, j) => (
                    <TextInput key={j} value={v} placeholder={o.metavars[j]} onChange={(e) => setTuple(i, j, e.target.value)} className="font-mono text-xs" />
                  ))}
                  {values.length > 1 && (
                    <button className="text-muted hover:text-err" onClick={() => onChange({ on: true, values: values.filter((_, k) => k !== i) })}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {o.repeatable && (
                <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onChange({ on: true, values: [...values, emptyTuple(o)] })}>
                  {t('Adicionar outro')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AllOptionsDialog({
  advanced,
  presets,
  onChange,
  onPresets,
  onClose
}: {
  advanced: AdvancedState
  presets: string[]
  onChange: (a: AdvancedState) => void
  onPresets: (p: string[]) => void
  onClose: () => void
}) {
  const [help, setHelp] = useState<HelpData | null>(null)
  const [q, setQ] = useState('')
  const [section, setSection] = useState<string>('')

  useEffect(() => {
    void window.api.getHelp().then((h) => {
      setHelp(h)
      setSection(h.sections[0]?.title ?? '')
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const total = useMemo(() => help?.sections.reduce((s, x) => s + x.options.length, 0) ?? 0, [help])
  const activeIn = (title: string) =>
    title === 'Preset Aliases' ? presets.length : help?.sections.find((s) => s.title === title)?.options.filter((o) => advanced[o.key]?.on).length ?? 0
  const activeTotal = Object.values(advanced).filter((v) => v.on).length + presets.length

  const query = q.trim().toLowerCase()
  const shown = useMemo(() => {
    if (!help) return []
    if (query) {
      return help.sections
        .map((s) => ({ ...s, options: s.options.filter((o) => `${o.flags.join(' ')} ${o.metavars.join(' ')} ${o.description}`.toLowerCase().includes(query)) }))
        .filter((s) => s.options.length)
    }
    return help.sections.filter((s) => s.title === section)
  }, [help, query, section])

  const setOne = (key: string, v: AdvancedValue | undefined) => {
    const next = { ...advanced }
    if (v) next[key] = v
    else delete next[key]
    onChange(next)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-8" onMouseDown={onClose}>
      <div className="flex h-full max-h-[900px] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-4 border-b border-line px-6 py-4">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{t('Todas as opções do yt-dlp')}</h2>
            <p className="text-xs text-muted">
              {help ? t('{n} opções lidas do próprio yt-dlp {version}', { n: total, version: help.version }) : t('Lendo a ajuda do yt-dlp…')}{t('. Descrições no original, em inglês. Têm prioridade sobre o painel.')}
            </p>
          </div>
          <div className="relative w-80">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-faint" />
            <TextInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar (ex.: cookies, proxy, limit-rate)')} className="pl-8" />
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-panel-3 hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </header>

        {!help ? (
          <div className="grid flex-1 place-items-center">
            <Spinner className="h-6 w-6 text-muted" />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <nav className="w-60 shrink-0 overflow-y-auto border-r border-line p-2">
              {help.sections.map((s) => {
                const n = activeIn(s.title)
                return (
                  <button
                    key={s.title}
                    onClick={() => {
                      setQ('')
                      setSection(s.title)
                    }}
                    className={cx(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm',
                      !query && section === s.title ? 'bg-panel-3 text-text' : 'text-muted hover:bg-panel-2 hover:text-text'
                    )}
                  >
                    <span className="flex-1">{sectionName(s.title)}</span>
                    {n > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] text-white">{n}</span>}
                    <span className="text-xs text-faint">{s.title === 'Preset Aliases' ? help.presets.length : s.options.length}</span>
                  </button>
                )
              })}
            </nav>
            <div className="min-w-0 flex-1 overflow-y-auto p-4">
              {shown.length === 0 && <div className="p-10 text-center text-muted">{t('Nada encontrado para “')}{q}”.</div>}
              {shown.map((s) => (
                <div key={s.title} className="mb-6">
                  <h3 className="mb-1 px-1 text-sm font-semibold">
                    {sectionName(s.title)}
                    {getLang() === 'pt' && <span className="font-normal text-faint">· {s.title}</span>}
                  </h3>
                  {s.note && <p className="mb-3 px-1 text-xs text-muted">{s.note}</p>}
                  {s.title === 'Preset Aliases' && !query ? (
                    <div className="space-y-1">
                      {help.presets.map((p) => (
                        <label key={p.name} className={cx('flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3', presets.includes(p.name) ? 'border-accent/40 bg-accent/5' : 'border-transparent hover:bg-panel-2')}>
                          <Checkbox
                            checked={presets.includes(p.name)}
                            onChange={(v) => onPresets(v ? [...presets, p.name] : presets.filter((x) => x !== p.name))}
                            className="mt-0.5"
                          />
                          <div>
                            <code className="text-[13px] font-semibold">-t {p.name}</code>
                            <p className="mt-1 font-mono text-xs text-muted">{p.expands}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {s.options.map((o) => (
                        <OptionRow key={o.key} o={o} value={advanced[o.key]} onChange={(v) => setOne(o.key, v)} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <footer className="flex items-center gap-3 border-t border-line px-6 py-3">
          <span className="flex-1 text-sm text-muted">{activeTotal} {activeTotal === 1 ? t('opção ativa') : t('opções ativas')}</span>
          <Button
            variant="ghost"
            disabled={!activeTotal}
            onClick={() => {
              onChange({})
              onPresets([])
            }}
          >
            {t('Limpar tudo')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('Concluir')}
          </Button>
        </footer>
      </div>
    </div>
  )
}
