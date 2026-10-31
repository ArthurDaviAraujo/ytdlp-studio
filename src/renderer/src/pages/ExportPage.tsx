import { useEffect, useMemo, useState } from 'react'
import { Clapperboard, FileVideo, FolderOpen, RefreshCw, Wand2 } from 'lucide-react'
import type { ExportSettings, Job, MediaInfo } from '../../../shared/types'
import { BUILTIN_PRESETS } from '../../../shared/presets'
import type { AppContext } from '../App'
import { Button, Card, Empty, Spinner } from '../components/ui'
import ExportForm from '../components/ExportForm'
import FramingPreview from '../components/FramingPreview'
import { bytes, duration, parseTime } from '../lib/format'

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

export default function ExportPage({ ctx, jobs, source, setSource }: { ctx: AppContext; jobs: Job[]; source: string | null; setSource: (p: string | null) => void }) {
  const [settings, setSettings] = useState<ExportSettings>(loadSettings)
  const [info, setInfo] = useState<MediaInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [at, setAt] = useState(0.1)

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
    const t = parseTime(settings.start) ?? info.duration * at
    const timer = setTimeout(() => void window.api.mediaFrame(info.path, t).then(setImage), 200)
    return () => clearTimeout(timer)
  }, [info, at, settings.start])

  const recent = useMemo(() => {
    const files: string[] = []
    for (const j of [...jobs].sort((a, b) => b.createdAt - a.createdAt)) {
      if (j.status !== 'done') continue
      for (const f of j.files) if (VIDEO_EXT.test(f) && !files.includes(f)) files.push(f)
    }
    return files.slice(0, 12)
  }, [jobs])

  const pick = async () => {
    const p = await window.api.pickVideo(source ?? ctx.settings.downloadDir)
    if (p) setSource(p)
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
      label: `${settings.name} · ${W}×${H}${settings.fps ? ` · ${settings.fps} fps` : ''}${settings.speed !== 1 ? ` · ${settings.speed}x` : ''}`,
      args: [],
      convert: null,
      exportSettings: settings,
      input: source
    })
    ctx.notify('Adicionado à fila', { label: 'Ver downloads', run: () => ctx.goTo('queue') })
  }

  const outName = source ? `${baseName(source).replace(/\.[^.]+$/, '')}.${settings.suffix || 'editado'}.mp4` : ''

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1000px] space-y-5 p-6">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Preparar vídeo</h1>
              <p className="text-sm text-muted">Ajuste tamanho, enquadramento, FPS e velocidade de um vídeo do seu PC para postar.</p>
            </div>
            <Button icon={<FolderOpen className="h-4 w-4" />} onClick={pick}>
              Escolher vídeo do PC
            </Button>
          </div>

          {!source && (
            <Card title="Vídeos baixados recentemente">
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
                <Empty icon={<Clapperboard className="h-8 w-8" />} title="Escolha um vídeo">
                  Use “Escolher vídeo do PC” ou o botão Preparar de um download concluído.
                </Empty>
              )}
            </Card>
          )}

          {source && (
            <Card
              title={baseName(source)}
              actions={
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => window.api.showInFolder(source)}>
                    Mostrar na pasta
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSource(null)}>
                    Trocar
                  </Button>
                </div>
              }
            >
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Spinner /> Lendo o vídeo…
                </div>
              )}
              {error && <div className="text-sm text-err">{error}</div>}
              {info && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                    <span className="text-text">
                      {info.width}×{info.height}
                    </span>
                    <span>{Math.round(info.fps * 100) / 100} fps</span>
                    <span>{duration(info.duration)}</span>
                    <span>
                      {info.vcodec}
                      {info.acodec ? ` + ${info.acodec}` : ' (sem áudio)'}
                    </span>
                    <span>{bytes(info.size)}</span>
                  </div>
                  <FramingPreview image={image} srcW={info.width} srcH={info.height} s={settings} />
                  {!settings.start && (
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <RefreshCw className="h-3.5 w-3.5" /> Momento da prévia
                      <input type="range" min={0} max={0.99} step={0.01} value={at} onChange={(e) => setAt(Number(e.target.value))} className="flex-1 accent-[#ff4d4d]" />
                      <span className="w-12 text-right">{duration(info.duration * at)}</span>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <aside className="flex h-full w-[392px] shrink-0 flex-col border-l border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <Wand2 className="h-4 w-4 text-muted" />
          <h2 className="text-[15px] font-semibold">Preparar para postar</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ExportForm
            value={settings}
            onChange={setSettings}
            caps={ctx.caps}
            rifeModels={ctx.tools.rife.models}
            source={info ? { width: info.width, height: info.height, fps: info.fps, duration: info.duration } : null}
            saved={ctx.settings.exportPresets}
            onSavePreset={ctx.savePreset}
            onDeletePreset={ctx.deletePreset}
          />
        </div>
        <div className="space-y-2 border-t border-line p-4">
          {outName && <div className="truncate text-xs text-muted" title={outName}>Vai gerar: {outName}</div>}
          <Button variant="primary" size="lg" className="w-full" icon={<Wand2 className="h-5 w-5" />} disabled={!info} onClick={run}>
            Preparar vídeo
          </Button>
        </div>
      </aside>
    </div>
  )
}
