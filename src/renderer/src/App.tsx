import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CircleArrowUp, Download, ListVideo, Settings as SettingsIcon, TriangleAlert, Wand2 } from 'lucide-react'
import type { Capabilities, ExportSettings, Job, Settings, ToolStatus, UpdateCheck } from '../../shared/types'
import DownloadPage from './pages/DownloadPage'
import ExportPage from './pages/ExportPage'
import QueuePage from './pages/QueuePage'
import SettingsPage from './pages/SettingsPage'
import { cx } from './components/ui'
import appIcon from './assets/icon.svg'

type Page = 'download' | 'export' | 'queue' | 'settings'

export interface AppContext {
  settings: Settings
  tools: ToolStatus
  caps: Capabilities | null
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  refreshTools: () => Promise<void>
  notify: (msg: string, action?: { label: string; run: () => void }) => void
  goTo: (p: Page) => void
  openExport: (path: string) => void
  savePreset: (s: ExportSettings) => void
  deletePreset: (id: string) => void
}

function useJobs(page: Page) {
  const [jobs, setJobs] = useState<Job[]>([])
  // Busca de novo ao abrir Downloads: se o histórico não pôde ser lido na abertura, o app tenta outra vez
  useEffect(() => {
    if (page !== 'download' && page !== 'queue') return
    void window.api.listJobs().then((list) =>
      setJobs((prev) => {
        const map = new Map(list.map((j) => [j.id, j]))
        for (const j of prev) if (!map.has(j.id)) map.set(j.id, j)
        return [...map.values()]
      })
    )
  }, [page])
  useEffect(() => {
    return window.api.onJobsUpdate((updated) =>
      setJobs((prev) => {
        const map = new Map(prev.map((j) => [j.id, j]))
        for (const j of updated) map.set(j.id, j)
        return [...map.values()]
      })
    )
  }, [])
  const drop = useCallback((ids: string[]) => setJobs((prev) => prev.filter((j) => !ids.includes(j.id))), [])
  return { jobs, drop }
}

export default function App() {
  const [page, setPage] = useState<Page>('download')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tools, setTools] = useState<ToolStatus | null>(null)
  const [toast, setToast] = useState<{ msg: string; action?: { label: string; run: () => void } } | null>(null)
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [exportSource, setExportSource] = useState<string | null>(null)
  const [update, setUpdate] = useState<UpdateCheck | null>(null)
  const [updating, setUpdating] = useState(false)
  const { jobs, drop } = useJobs(page)

  // Ao abrir, pergunta ao GitHub se há yt-dlp mais novo (uma vez por abertura)
  const checkEnabled = settings?.checkUpdates
  useEffect(() => {
    if (!checkEnabled) return
    void window.api.checkYtdlpUpdate().then((r) => r.newer && setUpdate(r))
  }, [checkEnabled])

  useEffect(() => {
    void window.api.getSettings().then(setSettings)
    void window.api.getToolStatus().then(setTools)
    void window.api.getCapabilities().then(setCaps)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  if (!settings || !tools) return <div className="h-full bg-bg" />

  const saveSettings = async (patch: Partial<Settings>) => {
    setSettings(await window.api.setSettings(patch))
    setTools(await window.api.getToolStatus())
  }

  const ctx: AppContext = {
    settings,
    tools,
    caps,
    saveSettings,
    refreshTools: async () => {
      setTools(await window.api.getToolStatus(true))
      setCaps(await window.api.getCapabilities())
    },
    notify: (msg, action) => setToast({ msg, action }),
    goTo: setPage,
    openExport: (path) => {
      setExportSource(path)
      setPage('export')
    },
    savePreset: (s) => {
      // Mesmo nome substitui a predefinição antiga
      const others = settings.exportPresets.filter((p) => p.settings.name !== s.name)
      void saveSettings({ exportPresets: [...others, { id: crypto.randomUUID(), settings: s }] })
      setToast({ msg: `Predefinição “${s.name}” salva` })
    },
    deletePreset: (id) => void saveSettings({ exportPresets: settings.exportPresets.filter((p) => p.id !== id) })
  }

  const active = jobs.filter((j) => j.status === 'running' || j.status === 'converting' || j.status === 'queued').length
  const missing = !tools.ytdlp.path || !tools.ffmpeg.path

  const nav: { id: Page; label: string; icon: ReactNode; badge?: number }[] = [
    { id: 'download', label: 'Baixar', icon: <Download className="h-[18px] w-[18px]" /> },
    { id: 'export', label: 'Preparar vídeo', icon: <Wand2 className="h-[18px] w-[18px]" /> },
    { id: 'queue', label: 'Downloads', icon: <ListVideo className="h-[18px] w-[18px]" />, badge: active || undefined },
    { id: 'settings', label: 'Configurações', icon: <SettingsIcon className="h-[18px] w-[18px]" /> }
  ]

  return (
    <div className="flex h-full">
      <aside className="flex w-[212px] shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
          <img src={appIcon} alt="" className="h-9 w-9" />
          <div>
            <div className="text-[15px] leading-4 font-semibold">yt-dlp GUI</div>
            <div className="text-[11px] text-muted">yt-dlp {tools.ytdlp.version ?? '?'}</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={cx(
                'flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                page === n.id ? 'bg-panel-3 text-text' : 'text-muted hover:bg-panel-2 hover:text-text'
              )}
            >
              {n.icon}
              <span className="flex-1 text-left">{n.label}</span>
              {n.badge != null && <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{n.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-2 p-3">
          {update && (
            <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-xs text-info">
              <div className="flex items-start gap-2">
                <CircleArrowUp className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  yt-dlp {update.latest} disponível
                  <div className="text-muted">você tem {update.current}</div>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  disabled={updating}
                  className="rounded-md bg-info/20 px-2 py-1 font-semibold hover:bg-info/30 disabled:opacity-50"
                  onClick={async () => {
                    setUpdating(true)
                    const r = await window.api.updateYtdlp('stable')
                    setUpdating(false)
                    await ctx.refreshTools()
                    setUpdate(null)
                    setToast({ msg: r.ok ? `yt-dlp atualizado para ${r.version}` : 'Não consegui atualizar; veja em Configurações' })
                  }}
                >
                  {updating ? 'Atualizando…' : 'Atualizar'}
                </button>
                <button className="px-2 py-1 text-muted hover:text-text" onClick={() => setUpdate(null)}>
                  Depois
                </button>
              </div>
            </div>
          )}
          {missing && (
            <button
              onClick={() => setPage('settings')}
              className="flex w-full items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 p-3 text-left text-xs text-warn"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {!tools.ytdlp.path ? 'yt-dlp.exe não encontrado' : 'ffmpeg.exe não encontrado'}. Toque para configurar.
            </button>
          )}
        </div>
      </aside>

      <main className="relative min-w-0 flex-1">
        <div className={cx('h-full', page !== 'download' && 'hidden')}>
          <DownloadPage ctx={ctx} />
        </div>
        {page === 'export' && <ExportPage ctx={ctx} jobs={jobs} source={exportSource} setSource={setExportSource} />}
        {page === 'queue' && <QueuePage ctx={ctx} jobs={jobs} onRemoved={drop} />}
        {page === 'settings' && <SettingsPage ctx={ctx} />}

        {toast && (
          <div className="absolute right-6 bottom-6 z-50 flex items-center gap-4 rounded-xl border border-line bg-panel-3 px-4 py-3 text-sm shadow-2xl">
            {toast.msg}
            {toast.action && (
              <button
                className="font-semibold text-accent hover:text-accent-hover"
                onClick={() => {
                  toast.action!.run()
                  setToast(null)
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
