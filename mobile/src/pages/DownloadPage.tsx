import { useEffect, useState } from 'react'
import { ClipboardPaste, Crown, Download, Music, Search, Video, X } from 'lucide-react'
import { BUILTIN_PRESETS } from '../../../src/shared/presets'
import type { ExportSettings } from '../../../src/shared/types'
import { t } from '../../../src/shared/i18n'
import { engine } from '../native'
import { addJob } from '../jobs'
import { Button, Card, Chip, Segmented, Spinner, TextInput, Toggle, cx } from '../ui'
import type { Ctx } from '../App'

interface Info {
  id: string
  title: string
  uploader?: string
  duration?: number
  thumbnail?: string
  webpage_url?: string
  formats?: { height?: number | null; vcodec?: string }[]
}

const dur = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '')

export default function DownloadPage({ ctx }: { ctx: Ctx }) {
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<Info | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'video' | 'audio'>('video')
  const [height, setHeight] = useState(0)
  const [audioFormat, setAudioFormat] = useState<'mp3' | 'm4a'>('mp3')
  const [prepOn, setPrepOn] = useState(false)
  const [preset, setPreset] = useState<ExportSettings>(BUILTIN_PRESETS[0].settings)

  // Link compartilhado de outro app (YouTube, TikTok…) cai direto aqui
  useEffect(() => {
    void engine.takeShared().then((r) => r.url && (setUrl(r.url), void analyze(r.url)))
    const sub = engine.addListener('shared', (e) => {
      setUrl(e.url)
      void analyze(e.url)
    })
    return () => void sub.then((h) => h.remove())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const analyze = async (u = url) => {
    if (!u.trim()) return
    setLoading(true)
    setError(null)
    setInfo(null)
    const r = await engine.ytdlp({ id: 'info', args: ['-J', '--no-playlist', '--no-warnings', u.trim()] })
    setLoading(false)
    if (r.code !== 0) return setError(r.err.trim().split('\n').pop() || t('Não consegui ler esse link'))
    try {
      setInfo(JSON.parse(r.out))
    } catch {
      setError(t('Não consegui ler esse link'))
    }
  }

  const paste = async () => {
    try {
      const txt = await navigator.clipboard.readText()
      if (txt) {
        setUrl(txt.trim())
        void analyze(txt.trim())
      }
    } catch {
      ctx.toast(t('Não deu para ler a área de transferência; cole com toque longo'))
    }
  }

  const heights = [...new Set((info?.formats ?? []).filter((f) => f.vcodec !== 'none' && f.height).map((f) => f.height!))].sort((a, b) => b - a)

  const start = () => {
    if (!info) return
    const label = mode === 'audio' ? `${t('Só áudio')} · ${audioFormat.toUpperCase()}` : `${height ? `${height}p` : t('Qualidade máxima')}${prepOn ? ` · ${t(preset.name)}` : ''}`
    addJob('download', info.title, info.thumbnail ?? null, label, { type: 'download', url: info.webpage_url ?? url, mode, height, audioFormat, prepare: prepOn && mode === 'video' ? preset : null })
    ctx.toast(t('Adicionado à fila'))
    ctx.goTo('queue')
  }

  return (
    <div className="space-y-4 p-4 pb-8">
      <div className="space-y-2.5">
        <div className="relative">
          <TextInput value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && analyze()} placeholder={t('Cole o link do vídeo')} inputMode="url" className="pr-10" />
          {url && (
            <button className="absolute top-1/2 right-3 -translate-y-1/2 text-muted" onClick={() => (setUrl(''), setInfo(null), setError(null))}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Button icon={<ClipboardPaste className="h-4 w-4" />} onClick={paste}>
            {t('Colar')}
          </Button>
          <Button variant="primary" icon={loading ? <Spinner /> : <Search className="h-4 w-4" />} disabled={loading || !url.trim()} onClick={() => analyze()}>
            {t('Analisar')}
          </Button>
        </div>
        {!info && !loading && !error && <p className="px-1 text-[13px] text-faint">{t('Dica: no YouTube, TikTok ou Instagram, toque em Compartilhar e escolha o yt-dlp GUI.')}</p>}
        {error && <p className="rounded-xl bg-err/10 px-3 py-2.5 text-[13px] text-err">{error}</p>}
      </div>

      {info && (
        <>
          <Card className="flex gap-3 p-3">
            {info.thumbnail && <img src={info.thumbnail} alt="" className="h-20 w-32 shrink-0 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-[15px] leading-5 font-medium">{info.title}</div>
              <div className="mt-1 truncate text-[13px] text-muted">{info.uploader}</div>
              <div className="text-[13px] text-faint">{dur(info.duration)}</div>
            </div>
          </Card>

          <Segmented<'video' | 'audio'>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'video', label: <><Video className="h-4 w-4" />{t('Vídeo')}</> },
              { value: 'audio', label: <><Music className="h-4 w-4" />{t('Só áudio')}</> }
            ]}
          />

          {mode === 'video' ? (
            <div className="space-y-2.5">
              <button type="button" onClick={() => setHeight(0)} className={cx('mq-btn block w-full', height === 0 && 'mq-on')}>
                <span className="mq-inner flex h-12 items-center gap-3 px-3.5">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-accent to-warn">
                    <Crown className="h-4 w-4 text-white" />
                  </span>
                  <span className="flex-1 text-left text-[15px] font-bold">{t('Qualidade máxima')}</span>
                  {height === 0 && <span className="text-[12px] text-ok">{t('escolhida')}</span>}
                </span>
              </button>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                {heights.map((h) => (
                  <Chip key={h} active={height === h} onClick={() => setHeight(h)}>
                    {h}p
                  </Chip>
                ))}
              </div>
            </div>
          ) : (
            <Segmented<'mp3' | 'm4a'>
              value={audioFormat}
              onChange={setAudioFormat}
              options={[
                { value: 'mp3', label: 'MP3' },
                { value: 'm4a', label: 'M4A' }
              ]}
            />
          )}

          {mode === 'video' && (
            <Card className="space-y-2 py-2">
              <Toggle checked={prepOn} onChange={setPrepOn} label={t('Preparar depois de baixar')} hint={t('Já sai no formato da rede escolhida. O original também fica.')} />
              {prepOn && (
                <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
                  {BUILTIN_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
                    <Chip key={p.id} active={preset.name === p.settings.name} onClick={() => setPreset(p.settings)}>
                      {t(p.settings.name)}
                    </Chip>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Button variant="primary" size="lg" className="w-full" icon={<Download className="h-5 w-5" />} onClick={start}>
            {t('Baixar')}
          </Button>
        </>
      )}
    </div>
  )
}
