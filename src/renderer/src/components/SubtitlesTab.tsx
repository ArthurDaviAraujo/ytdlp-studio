/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Badge, Button, Checkbox, TextInput, cx } from './ui'
import type { DownloadOptions } from '../lib/args'

interface Lang {
  code: string
  name: string
  exts: string[]
}

function toLangs(map: Record<string, any[]> | undefined): Lang[] {
  return Object.entries(map ?? {}).map(([code, list]) => ({
    code,
    name: list.find((x) => x.name)?.name ?? code,
    exts: [...new Set(list.map((x) => x.ext).filter(Boolean))] as string[]
  }))
}

function LangList({
  title,
  hint,
  langs,
  selected,
  onChange
}: {
  title: string
  hint: string
  langs: Lang[]
  selected: string[]
  onChange: (codes: string[]) => void
}) {
  const [q, setQ] = useState('')
  const shown = langs.filter((l) => !q || `${l.name} ${l.code}`.toLowerCase().includes(q.toLowerCase()))
  const set = new Set(selected)
  const toggle = (code: string) => onChange(set.has(code) ? selected.filter((c) => c !== code) : [...selected, code])
  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-line bg-panel">
      <div className="space-y-2 border-b border-line p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">
              {title} <span className="text-muted">({langs.length})</span>
            </div>
            <div className="text-xs text-muted">{hint}</div>
          </div>
          {selected.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onChange([])}>
              Limpar ({selected.length})
            </Button>
          )}
        </div>
        {langs.length > 8 && (
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-faint" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar idioma" className="pl-8" />
          </div>
        )}
      </div>
      <div className="max-h-[52vh] overflow-y-auto p-1.5">
        {!langs.length && <div className="p-4 text-sm text-muted">Nenhuma.</div>}
        {shown.map((l) => (
          <label
            key={l.code}
            className={cx('flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5', set.has(l.code) ? 'bg-accent/10' : 'hover:bg-panel-2')}
          >
            <Checkbox checked={set.has(l.code)} onChange={() => toggle(l.code)} />
            <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
            <span className="font-mono text-xs text-muted">{l.code}</span>
            <span className="hidden gap-1 2xl:flex">
              {l.exts.slice(0, 4).map((e) => (
                <Badge key={e}>{e}</Badge>
              ))}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

export default function SubtitlesTab({
  info,
  opts,
  setOpts
}: {
  info: any
  opts: DownloadOptions
  setOpts: (fn: (o: DownloadOptions) => DownloadOptions) => void
}) {
  const manual = useMemo(() => toLangs(info.subtitles), [info])
  // Faixas "-orig" (idioma original) primeiro; o resto são traduções automáticas
  const auto = useMemo(
    () => toLangs(info.automatic_captions).sort((a, b) => Number(b.code.endsWith('-orig')) - Number(a.code.endsWith('-orig'))),
    [info]
  )
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Marque os idiomas que quer baixar. Formato, embutir no vídeo ou salvar como arquivo separado ficam no painel de opções.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <LangList
          title="Legendas enviadas"
          hint="Feitas pelo canal (--write-subs)"
          langs={manual}
          selected={opts.subsManual}
          onChange={(subsManual) => setOpts((o) => ({ ...o, subsManual }))}
        />
        <LangList
          title="Legendas automáticas"
          hint="Geradas ou traduzidas pela plataforma (--write-auto-subs)"
          langs={auto}
          selected={opts.subsAuto}
          onChange={(subsAuto) => setOpts((o) => ({ ...o, subsAuto }))}
        />
      </div>
    </div>
  )
}
