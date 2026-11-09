import { useEffect, useMemo, useState } from 'react'
import { Clapperboard, FileVideo, Files, FolderOpen, Gauge, Music, RefreshCw, Scissors, Wand2, X } from 'lucide-react'
import type { EditPlan, ExportSettings, Job, MediaInfo } from '../../../shared/types'
import { BUILTIN_PRESETS } from '../../../shared/presets'
import type { AppContext } from '../App'
import { Button, Card, Empty, Spinner } from '../components/ui'
import ExportForm, { ENCODER_LABEL, exportSummary, niceTime } from '../components/ExportForm'
import BeforeAfter from '../components/BeforeAfter'
import FramingPreview from '../components/FramingPreview'
import { bytes, duration, parseTime } from '../lib/format'
import { t } from '../../../shared/i18n'

const STORE_KEY = 'export-page-settings'
const VIDEO_EXT = /\.(mp4|mkv|webm|mov|avi|m4v|ts|flv|wmv)$/i
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p

function loadSettings(): ExportSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null')
    if (saved) return { ...BUILTIN_PRESETS[0].settings, ...saved, start: '', end: '' }
  } catch {
    // sem armazenamento: começa no TikTok
  }
  return { ...BUILTIN_PRESETS[0].settings }
}

interface Props {
  ctx: AppContext
  jobs: Job[]
  source: string | null
  setSource: (p: string | null) => void
  /** Cortes e música vindos do editor */
  edit: EditPlan | null
  clearEdit: () => void
}

export default function ExportPage({ ctx, jobs, source, setSource, edit, clearEdit }: Props) {
  const [settings, setSettings] = useState<ExportSettings>(loadSettings)
  const [info, setInfo] = useState<MediaInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  // Quadro parado só para quando o vídeo não toca na prévia
  const at = 0.1

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...settings, start: '', end: '' }))
    } catch {
      // ignora
    }
  }, [settings])

  useEffect(() => {
    setInfo(null)
    setImage(null)
    setError(null)
    if (!source) return
    setLoading(true)
    void window.api.probeMedia(source).then((r) => {
      setLoading(false)
      if (r.ok) setInfo(r.info)
      else setError(r.error)
    })
  }, [source])

  // Quadro da prévia: começa em 10% do vídeo (ou no início do trecho)
  useEffect(() => {
    if (!info) return
    const sec = parseTime(settings.start) ?? info.duration * at
    const timer = setTimeout(() => void window.api.mediaFrame(info.path, sec).then(setImage), 200)
    return () => clearTimeout(timer)
  }, [info, settings.start])

  const recent = useMemo(() => {
    const files: string[] = []
    for (const j of [...jobs].sort((a, b) => b.createdAt - a.createdAt)) {
      if (j.status !== 'done') continue
      for (const f of j.files) if (VIDEO_EXT.test(f) && !files.includes(f)) files.push(f)
    }
    return files.slice(0, 12)
  }, [jobs])

  // Duração depois dos cortes do editor (o trecho e o limite de duração valem sobre ela)
  // Velocidade do editor: a duração que chega aqui já é a acelerada
  const editSpeed = edit?.speed && edit.speed > 0 ? edit.speed : 1
  const editDur = edit?.segments.length ? edit.segments.reduce((acc, s) => acc + (s.end - s.start), 0) / editSpeed : edit && info && editSpeed !== 1 ? info.duration / editSpeed : null

  const pick = async () => {
    const p = await window.api.pickVideo(source ?? ctx.settings.downloadDir)
    if (p) setSource(p)
  }

  // Lote: os mesmos ajustes em vários vídeos; cada um vira um item na fila (sem trecho, que é de um vídeo só)
  const runMany = async () => {
    const files = await window.api.pickVideos(source ?? ctx.settings.downloadDir)
    if (!files.length) return
    const s = { ...settings, start: '', end: '' }
    for (const f of files) {
      await window.api.addJob({
        kind: 'export',
        url: '',
        title: baseName(f),
        thumbnail: null,
        label: `${t(s.name)} · ${t('lote')}${s.width ? ` · ${s.width}×${s.height}` : ''}${s.fps ? ` · ${s.fps} fps` : ''}${s.speed !== 1 ? ` · ${s.speed}x` : ''}`,
        args: [],
        convert: null,
        exportSettings: s,
        input: f,
        edit: null
      })
    }
    ctx.notify(t('{n} vídeo(s) adicionados à fila', { n: files.length }), { label: t('Ver downloads'), run: () => ctx.goTo('queue') })
  }

  const run = async () => {
    if (!source || !info) return
    const W = settings.width || info.width
    const H = settings.height || info.height
    await window.api.addJob({
      kind: 'export',
      url: '',
      title: baseName(source),
      thumbnail: null,
      label: `${t(settings.name)}${edit ? ' · ' + t('editado no Editor') : ''} · ${W}×${H}${settings.fps ? ` · ${settings.fps} fps` : ''}${settings.speed !== 1 ? ` · ${settings.speed}x` : ''}`,
      args: [],
      convert: null,
      exportSettings: settings,
      input: source,
      edit
    })
    ctx.notify(t('Adicionado à fila'), { label: t('Ver downloads'), run: () => ctx.goTo('queue') })
  }

  // Só troca o formato para H.264, sem mexer em tamanho, FPS, som ou legendas (o original continua na pasta)
  const isH264 = info?.vcodec === 'h264'
  const convertOnly = async () => {
    if (!source || !info) return
    const encoder = /^(h264_|libx264|libopenh264)/.test(settings.encoder) ? settings.encoder : ''
    const best = encoder || ctx.caps?.encoders[0] || 'libx264'
    await window.api.addJob({
      kind: 'convert',
      url: '',
      title: baseName(source),
      thumbnail: null,
      label: `H.264 · ${info.width}×${info.height} · ${t(ENCODER_LABEL[best] ?? best)}`,
      args: [],
      convert: { encoder, keepOriginal: true },
      input: source
    })
    ctx.notify(t('Adicionado à fila'), { label: t('Ver downloads'), run: () => ctx.goTo('queue') })
  }

  const [estimate, setEstimate] = useState<number | null>(null)
  const summary = exportSummary(settings, info ? { width: info.width, height: info.height, fps: info.fps, duration: editDur ?? info.duration } : null)
  const outName = source ? `${baseName(source).replace(/\.[^.]+$/, '')}.${settings.suffix || 'editado'}.mp4` : ''

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <h1 className="text-xl font-semibold">{t('Preparar vídeo')}</h1>
              <p className="text-sm text-muted">{t('Ajuste tamanho, enquadramento, FPS e velocidade de um vídeo do seu PC para postar.')}</p>
            </div>
            <Button variant="ghost" icon={<Files className="h-4 w-4" />} onClick={runMany} title={t('Escolha vários vídeos: todos são preparados com as opções do painel ao lado, um depois do outro.')}>
              {t('Preparar vários')}
            </Button>
            <Button icon={<FolderOpen className="h-4 w-4" />} onClick={pick}>
              {t('Escolher vídeo do PC')}
            </Button>
          </div>

          {!source && (
            <Card title={t('Vídeos baixados recentemente')}>
              {recent.length ? (
                <div className="space-y-1">
                  {recent.map((f) => (
                    <button key={f} onClick={() => setSource(f)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel-2">
                      <FileVideo className="h-4 w-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{baseName(f)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty icon={<Clapperboard className="h-8 w-8" />} title={t('Escolha um vídeo')}>
                  {t('Use “Escolher vídeo do PC” ou o botão Preparar de um download concluído.')}
                </Empty>
              )}
            </Card>
          )}

          {source && (
            <Card
              title={baseName(source)}
              actions={
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    disabled={!info || isH264}
                    onClick={convertOnly}
                    title={
                      isH264
                        ? t('Este vídeo já está em H.264.')
                        : t('Troca só o formato para H.264, o que abre em qualquer celular, TV e site. Tamanho, FPS, som e legendas ficam iguais; o original continua na pasta e o novo sai com ".h264.mp4" no nome.')
                    }
                  >
                    {t('Só converter para H.264')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => window.api.showInFolder(source)}>
                    {t('Mostrar na pasta')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSource(null)}>
                    {t('Trocar')}
                  </Button>
                </div>
              }
            >
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Spinner />{t(' Lendo o vídeo…')}
                </div>
              )}
              {error && <div className="text-sm text-err">{error}</div>}
              {info && (
                <div className="space-y-4">
                  {edit && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-accent/30 bg-accent/8 px-3 py-2 text-sm">
                      <span className="font-medium text-accent">{t('Com a edição do Editor')}</span>
                      {edit.segments.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 text-muted">
                          <Scissors className="h-3.5 w-3.5" />
                          {t('{n} trecho(s) · {dur}', { n: edit.segments.length, dur: duration(editDur ?? 0) })}
                        </span>
                      )}
                      {editSpeed !== 1 && (
                        <span className="inline-flex items-center gap-1.5 text-muted">
                          <Gauge className="h-3.5 w-3.5" />
                          {t('velocidade {speed}x', { speed: editSpeed })} · {duration(editDur ?? 0)}
                        </span>
                      )}
                      {(edit.videoVolume ?? 1) !== 1 && <span className="text-muted">{t('Som do vídeo: {n}%', { n: Math.round((edit.videoVolume ?? 1) * 100) })}</span>}
                      {edit.musics.length > 0 && (
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-muted" title={edit.musics.map((m) => baseName(m.path)).join('\n')}>
                          <Music className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{edit.musics.length === 1 ? baseName(edit.musics[0].path) : t('{n} músicas', { n: edit.musics.length })}</span>
                        </span>
                      )}
                      <span className="ml-auto text-xs text-faint">{t('A prévia mostra o vídeo original; o arquivo final sai com os cortes e a música.')}</span>
                      <button className="rounded p-1 text-muted hover:bg-panel-3 hover:text-text" title={t('Tirar a edição')} onClick={clearEdit}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                    <span className="text-text">
                      {info.width}×{info.height}
                    </span>
                    <span>{Math.round(info.fps * 100) / 100} fps</span>
                    <span>{duration(info.duration)}</span>
                    <span>
                      {info.vcodec}
                      {info.acodec ? ` + ${info.acodec}` : t(' (sem áudio)')}
                    </span>
                    <span>{bytes(info.size)}</span>
                  </div>
                  <FramingPreview
                    image={image}
                    srcW={info.width}
                    srcH={info.height}
                    s={settings}
                    onChange={(patch) => setSettings((cur) => ({ ...cur, ...patch }))}
                    video={info.path}
                    total={info.duration}
                  />
                  <BeforeAfter input={info.path} settings={settings} time={parseTime(settings.start) ?? info.duration * at} />
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <aside className="flex h-full w-[392px] shrink-0 flex-col border-l border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <Wand2 className="h-4 w-4 text-muted" />
          <h2 className="text-[15px] font-semibold">{t('Preparar para postar')}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ExportForm
            value={settings}
            onChange={setSettings}
            caps={ctx.caps}
            rifeModels={ctx.tools.rife.models}
            source={info ? { width: info.width, height: info.height, fps: info.fps, duration: editDur ?? info.duration } : null}
            saved={ctx.settings.exportPresets}
            onSavePreset={ctx.savePreset}
            onDeletePreset={ctx.deletePreset}
            inputPath={source}
            upscalers={ctx.tools.upscalers}
            tools={ctx.tools}
            onEstimate={setEstimate}
          />
        </div>
        <div className="space-y-2 border-t border-line p-4">
          {info && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted">
              {summary.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-faint">·</span>}
                  <span className={/Real-/.test(p) ? 'text-warn' : i === 0 ? 'text-text' : ''}>{p}</span>
                </span>
              ))}
              {estimate != null && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-faint">·</span>
                  <span className="font-medium text-text">≈ {niceTime(estimate)}</span>
                </span>
              )}
            </div>
          )}
          {outName && <div className="truncate text-xs text-faint" title={outName}>{t('Vai gerar: ')}{outName}</div>}
          <Button variant="primary" size="lg" className="w-full" icon={<Wand2 className="h-5 w-5" />} disabled={!info} onClick={run}>
            {t('Preparar vídeo')}
          </Button>
        </div>
      </aside>
    </div>
  )
}
