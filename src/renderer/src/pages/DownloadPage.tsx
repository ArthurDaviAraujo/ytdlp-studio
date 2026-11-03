/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ClipboardPaste, Link2, ListVideo, Search, TriangleAlert, X } from 'lucide-react'
import type { InfoResult } from '../../../shared/types'
import type { AppContext } from '../App'
import { Button, Segmented, Spinner } from '../components/ui'
import VideoView, { thumbOf, type VideoTab } from '../components/VideoView'
import PlaylistView from '../components/PlaylistView'
import OptionsPanel from '../components/OptionsPanel'
import AllOptionsDialog from '../components/AllOptionsDialog'
import demoGif from '../assets/demo.gif'
import { DEFAULT_OPTIONS, PER_VIDEO_KEYS, buildArgs, describe, type DownloadOptions } from '../lib/args'
import { t } from '../../../shared/i18n'

const STORE_KEY = 'download-options'

function loadOptions(): DownloadOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')
    return {
      ...DEFAULT_OPTIONS,
      ...saved,
      // Campos novos de versões futuras continuam com o valor padrão
      exportSettings: { ...DEFAULT_OPTIONS.exportSettings, ...(saved.exportSettings ?? {}), start: '', end: '' },
      ...Object.fromEntries(PER_VIDEO_KEYS.map((k) => [k, DEFAULT_OPTIONS[k]]))
    }
  } catch {
    return { ...DEFAULT_OPTIONS }
  }
}

function saveOptions(o: DownloadOptions): void {
  try {
    const copy: Record<string, unknown> = { ...o }
    for (const k of PER_VIDEO_KEYS) delete copy[k]
    if (copy.mode === 'manual') copy.mode = 'video'
    localStorage.setItem(STORE_KEY, JSON.stringify(copy))
  } catch {
    // sem armazenamento: as opções valem só nesta sessão
  }
}

const extractUrls = (s: string) => s.match(/https?:\/\/\S+/g) ?? []
const hasVideoAndList = (u: string) => /[?&]list=/.test(u) && (/[?&]v=/.test(u) || /youtu\.be\//.test(u))

interface Analysis {
  url: string
  result: InfoResult
}

export default function DownloadPage({ ctx }: { ctx: AppContext }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState<Analysis | null>(null)
  const [stack, setStack] = useState<Analysis[]>([])
  const [opts, setOptsState] = useState<DownloadOptions>(loadOptions)
  const [tab, setTab] = useState<VideoTab>('overview')
  const [showAll, setShowAll] = useState(false)
  const [encoders, setEncoders] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const setOpts = (fn: (o: DownloadOptions) => DownloadOptions) => setOptsState((o) => fn(o))

  useEffect(() => saveOptions(opts), [opts])
  useEffect(() => {
    void window.api.getEncoders().then(setEncoders)
  }, [ctx.tools.ffmpeg.path])

  const urls = extractUrls(input)
  const info = current?.result.ok ? current.result.info : null
  const isPlaylist = info?._type === 'playlist'
  const args = useMemo(() => buildArgs(opts, { isPlaylist }), [opts, isPlaylist])
  const advancedCount = Object.values(opts.advanced).filter((v) => v.on).length + opts.presets.length

  const analyze = async (url: string, noPlaylist: boolean, push = false) => {
    if (!url) return
    setLoading(true)
    if (push && current) setStack((s) => [...s, current])
    if (!push) setStack([])
    const result = await window.api.getInfo({ url, noPlaylist })
    setLoading(false)
    if (result.canceled) return
    setCurrent({ url, result })
    setTab('overview')
    setOpts((o) => ({
      ...o,
      ...Object.fromEntries(PER_VIDEO_KEYS.map((k) => [k, DEFAULT_OPTIONS[k]])),
      mode: o.mode === 'manual' ? 'video' : o.mode,
      exportSettings: { ...o.exportSettings, start: '', end: '' }
    }))
  }

  const back = () => {
    const prev = stack[stack.length - 1]
    setStack((s) => s.slice(0, -1))
    setCurrent(prev)
    setTab('overview')
  }

  const convert = () =>
    opts.convertH264 && opts.mode !== 'audio' && encoders.length
      ? { encoder: opts.convertEncoder && encoders.includes(opts.convertEncoder) ? opts.convertEncoder : encoders[0], keepOriginal: opts.convertKeep }
      : null

  const exportFor = () => (opts.exportOn && opts.mode !== 'audio' ? opts.exportSettings : null)

  const queued = (n: number) =>
    ctx.notify(n === 1 ? t('Adicionado à fila de downloads') : t('{n} links adicionados à fila', { n }), { label: t('Ver downloads'), run: () => ctx.goTo('queue') })

  const enqueueAnalyzed = async () => {
    await window.api.addJob({
      url: info.webpage_url ?? info.original_url ?? current!.url,
      title: info.title ?? current!.url,
      thumbnail: thumbOf(info) ?? thumbOf(info.entries?.[0]),
      label: describe(opts, { isPlaylist }) + (isPlaylist ? ` · ${opts.playlistItems ? t('itens {list}', { list: opts.playlistItems }) : t('playlist inteira')}` : ''),
      args,
      convert: convert(),
      exportSettings: exportFor()
    })
    queued(1)
  }

  const enqueueRaw = async (list: string[]) => {
    const rawArgs = buildArgs(opts, { isPlaylist: false })
    for (const url of list) {
      await window.api.addJob({ url, title: url, thumbnail: null, label: describe(opts, { isPlaylist: false }), args: rawArgs, convert: convert(), exportSettings: exportFor() })
    }
    queued(list.length)
  }

  const analyzedThis = info && urls.length === 1 && urls[0] === current?.url
  const action =
    urls.length > 1
      ? { label: t('Adicionar {n} links à fila', { n: urls.length }), disabled: false, run: () => void enqueueRaw(urls) }
      : info && (analyzedThis || urls.length === 0 || stack.length > 0)
        ? {
            label: isPlaylist ? t('Baixar playlist') : t('Baixar'),
            disabled: isPlaylist && opts.playlistItems === '0',
            run: () => void enqueueAnalyzed()
          }
        : urls.length === 1
          ? { label: t('Baixar sem analisar'), disabled: false, run: () => void enqueueRaw(urls) }
          : { label: t('Baixar'), disabled: true, run: () => {} }

  const submit = () => {
    if (urls.length === 1) void analyze(urls[0], opts.noPlaylist)
  }

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1180px] space-y-5 p-6">
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute top-3.5 left-3.5 h-5 w-5 text-faint" />
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder={t('Cole o link de um vídeo, playlist ou canal')}
                  className="h-12 w-full rounded-xl border border-line bg-panel pr-10 pl-11 text-[15px] outline-none placeholder:text-faint focus:border-info"
                />
                {input && (
                  <button className="absolute top-3.5 right-3 text-faint hover:text-text" onClick={() => setInput('')}>
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
              <Button
                size="lg"
                icon={<ClipboardPaste className="h-4 w-4" />}
                onClick={async () => {
                  const text = (await window.api.readClipboard()).trim()
                  setInput(text)
                  const found = extractUrls(text)
                  if (found.length === 1) void analyze(found[0], opts.noPlaylist)
                }}
              >
                {t('Colar')}
              </Button>
              {loading ? (
                <Button size="lg" variant="danger" icon={<X className="h-4 w-4" />} onClick={() => window.api.cancelInfo().then(() => setLoading(false))}>
                  {t('Parar')}
                </Button>
              ) : (
                <Button size="lg" variant="primary" icon={<Search className="h-4 w-4" />} disabled={urls.length !== 1} onClick={submit}>
                  {t('Analisar')}
                </Button>
              )}
            </div>
            {urls.length === 1 && hasVideoAndList(urls[0]) && (
              <div className="flex items-center gap-3 text-sm text-muted">
                <ListVideo className="h-4 w-4" />{t(' Este link tem um vídeo e uma playlist.')}
                <div className="w-72">
                  <Segmented<'video' | 'list'>
                    value={opts.noPlaylist ? 'video' : 'list'}
                    onChange={(v) => setOpts((o) => ({ ...o, noPlaylist: v === 'video' }))}
                    options={[
                      { value: 'video', label: t('Só o vídeo') },
                      { value: 'list', label: t('A playlist inteira') }
                    ]}
                  />
                </div>
              </div>
            )}
            {urls.length > 1 && (
              <div className="text-sm text-muted">
                {urls.length}{t(' links encontrados. Eles vão para a fila com as opções do painel, sem análise individual.')}
              </div>
            )}
          </div>

          {stack.length > 0 && (
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={back}>
              {t('Voltar para ')}{stack[stack.length - 1].result.info?.title ?? t('a lista')}
            </Button>
          )}

          {loading && (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-panel p-5 text-sm">
              <Spinner className="h-5 w-5 text-accent" />
              {t('Lendo informações com o yt-dlp… Pode levar alguns segundos (playlists grandes demoram mais).')}
            </div>
          )}

          {!loading && current && !current.result.ok && (
            <div className="space-y-2 rounded-xl border border-err/30 bg-err/10 p-5">
              <div className="flex items-center gap-2 font-semibold text-err">
                <TriangleAlert className="h-5 w-5" />{t(' Não consegui ler este link')}
              </div>
              <pre className="font-sans text-sm whitespace-pre-wrap text-err/90">{current.result.error}</pre>
            </div>
          )}

          {!loading && current && current.result.warnings.length > 0 && (
            <details className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-sm text-warn">
              <summary className="cursor-pointer">
                {current.result.warnings.length > 1 ? t('{n} avisos do yt-dlp', { n: current.result.warnings.length }) : t('1 aviso do yt-dlp')}
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {current.result.warnings.map((w, i) => (
                  <li key={i} className="selectable">
                    {w}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {!loading && info && !isPlaylist && <VideoView info={info} tab={tab} setTab={setTab} opts={opts} setOpts={setOpts} />}
          {!loading && info && isPlaylist && (
            <PlaylistView info={info} opts={opts} setOpts={setOpts} onOpenEntry={(url) => void analyze(url, true, true)} />
          )}

          {!loading && !current && (
            <div className="flex flex-col items-center py-8 text-center">
              <h2 className="text-lg font-semibold">{t('Cole um link para começar')}</h2>
              <p className="mt-1 max-w-md text-sm text-muted">
                {t('O app mostra tudo o que o yt-dlp encontrar: formatos, qualidades, áudio, legendas, miniaturas, capítulos e comentários.')}
              </p>
              <img src={demoGif} alt={t('Demonstração: baixar com Qualidade máxima, cortar e pôr música no Editor e preparar para o TikTok com estimativa de tempo')} className="mt-6 w-full max-w-[760px] rounded-xl border border-line shadow-2xl" />
              <ol className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted">
                {['Cole o link', 'Clique em Analisar', 'Escolha formato e qualidade', 'Baixe e acompanhe em Downloads'].map((step, i) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent">{i + 1}</span>
                    {t(step)}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      <OptionsPanel
        ctx={ctx}
        info={isPlaylist ? null : info}
        isPlaylist={isPlaylist}
        opts={opts}
        setOpts={setOpts}
        encoders={encoders}
        advancedCount={advancedCount}
        onOpenAll={() => setShowAll(true)}
        args={args}
        url={info?.webpage_url ?? urls[0] ?? ''}
        action={action}
      />

      {showAll && (
        <AllOptionsDialog
          advanced={opts.advanced}
          presets={opts.presets}
          onChange={(advanced) => setOpts((o) => ({ ...o, advanced }))}
          onPresets={(presets) => setOpts((o) => ({ ...o, presets }))}
          onClose={() => setShowAll(false)}
        />
      )}
    </div>
  )
}
