import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CircleArrowUp, Download, ListVideo, Scissors, Settings as SettingsIcon, TriangleAlert, Wand2 } from 'lucide-react'
import type { AppUpdateCheck, Capabilities, EditPlan, ExportSettings, Job, Settings, ToolStatus, UpdateCheck } from '../../shared/types'
import DownloadPage from './pages/DownloadPage'
import EditorPage from './pages/EditorPage'
import ExportPage from './pages/ExportPage'
import QueuePage from './pages/QueuePage'
import SettingsPage from './pages/SettingsPage'
import { cx } from './components/ui'
import appIcon from './assets/icon.svg'
import { setLang, t } from '../../shared/i18n'

type Page = 'download' | 'editor' | 'export' | 'queue' | 'settings'

export interface AppContext {
  settings: Settings
  tools: ToolStatus
  caps: Capabilities | null
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  refreshTools: () => Promise<void>
  notify: (msg: string, action?: { label: string; run: () => void }) => void
  goTo: (p: Page) => void
  /** Abre Preparar vídeo; com `edit`, os cortes e a música do editor vão junto */
  openExport: (path: string, edit?: EditPlan | null) => void
  openEditor: (path: string) => void
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
  // Clique no aviso do Windows abre a página pedida
  useEffect(() => window.api.onGoto((p) => setPage(p as Page)), [])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tools, setTools] = useState<ToolStatus | null>(null)
  const [toast, setToast] = useState<{ msg: string; action?: { label: string; run: () => void } } | null>(null)
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [exportSource, setExportSource] = useState<string | null>(null)
  const [editorSource, setEditorSource] = useState<string | null>(null)
  const [exportEdit, setExportEdit] = useState<EditPlan | null>(null)
  const [update, setUpdate] = useState<UpdateCheck | null>(null)
  const [updating, setUpdating] = useState(false)
  // Versão nova do próprio app: baixa o instalador com progresso e abre
  const [appUpdate, setAppUpdate] = useState<AppUpdateCheck | null>(null)
  const [appProgress, setAppProgress] = useState<number | null>(null)
  const { jobs, drop } = useJobs(page)

  // Ao abrir, pergunta ao GitHub se há yt-dlp mais novo (uma vez por abertura)
  const checkEnabled = settings?.checkUpdates
  useEffect(() => {
    if (!checkEnabled) return
    void window.api.checkYtdlpUpdate().then((r) => r.newer && setUpdate(r))
    void window.api.checkAppUpdate().then((r) => r.newer && r.url && setAppUpdate(r))
  }, [checkEnabled])
  useEffect(() => window.api.onAppUpdateProgress(setAppProgress), [])
  // Uma IA baixada agora: relê os programas para a opção aparecer sem reabrir o app
  useEffect(() => {
    const h = async () => {
      setTools(await window.api.getToolStatus(true))
      setCaps(await window.api.getCapabilities())
    }
    window.addEventListener('tools-changed', h)
    return () => window.removeEventListener('tools-changed', h)
  }, [])

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
  // Os textos de todas as telas saem no idioma escolhido a partir daqui
  setLang(settings.language)
  document.documentElement.lang = settings.language === 'pt' ? 'pt-BR' : 'en'

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
    openExport: (path, edit) => {
      setExportSource(path)
      setExportEdit(edit ?? null)
      setPage('export')
    },
    openEditor: (path) => {
      setEditorSource(path)
      setPage('editor')
    },
    savePreset: (s) => {
      // Mesmo nome substitui a predefinição antiga
      const others = settings.exportPresets.filter((p) => p.settings.name !== s.name)
      void saveSettings({ exportPresets: [...others, { id: crypto.randomUUID(), settings: s }] })
      setToast({ msg: t('Predefinição “{name}” salva', { name: s.name }) })
    },
    deletePreset: (id) => void saveSettings({ exportPresets: settings.exportPresets.filter((p) => p.id !== id) })
  }

  const active = jobs.filter((j) => j.status === 'running' || j.status === 'converting' || j.status === 'queued').length
  const missing = !tools.ytdlp.path || !tools.ffmpeg.path

  const nav: { id: Page; label: string; icon: ReactNode; badge?: number }[] = [
    { id: 'download', label: t('Baixar'), icon: <Download className="h-[18px] w-[18px]" /> },
    { id: 'editor', label: t('Editor'), icon: <Scissors className="h-[18px] w-[18px]" /> },
    { id: 'export', label: t('Preparar vídeo'), icon: <Wand2 className="h-[18px] w-[18px]" /> },
    { id: 'queue', label: t('Downloads'), icon: <ListVideo className="h-[18px] w-[18px]" />, badge: active || undefined },
    { id: 'settings', label: t('Configurações'), icon: <SettingsIcon className="h-[18px] w-[18px]" /> }
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
          {appUpdate && (
            <div className="rounded-lg border border-ok/30 bg-ok/10 p-3 text-xs text-ok">
              <div className="flex items-start gap-2">
                <CircleArrowUp className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  yt-dlp GUI {appUpdate.latest}{t(' disponível')}
                  <div className="text-muted">
                    {t('você tem ')}
                    {appUpdate.current}
                    {appUpdate.size ? ` · ${Math.round(appUpdate.size / 1048576)} MB` : ''}
                  </div>
                </div>
              </div>
              {appProgress != null && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ok/15">
                  <div className="h-full bg-ok transition-[width]" style={{ width: `${appProgress}%` }} />
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
                <button
                  disabled={appProgress != null}
                  className="rounded-md bg-ok/20 px-2 py-1 font-semibold hover:bg-ok/30 disabled:opacity-60"
                  onClick={async () => {
                    if (!appUpdate.url) return
                    setAppProgress(0)
                    const r = await window.api.installAppUpdate(appUpdate.url, appUpdate.size)
                    if (!r.ok) {
                      setAppProgress(null)
                      setToast({ msg: t('Não consegui baixar a atualização: {error}', { error: r.error ?? '' }) })
                    }
                  }}
                  title={t('Baixa o instalador novo e abre. O app fecha sozinho para a instalação trocar os arquivos.')}
                >
                  {appProgress == null ? t('Atualizar') : appProgress >= 100 ? t('Abrindo o instalador…') : t('Baixando {n}%', { n: Math.floor(appProgress) })}
                </button>
                {appUpdate.page && (
                  <button className="px-1 py-1 text-muted hover:text-text" onClick={() => window.api.openExternal(appUpdate.page!)}>
                    {t('Novidades')}
                  </button>
                )}
                {appProgress == null && (
                  <button className="px-1 py-1 text-muted hover:text-text" onClick={() => setAppUpdate(null)}>
                    {t('Depois')}
                  </button>
                )}
              </div>
            </div>
          )}
          {update && (
            <div className="rounded-lg border border-info/30 bg-info/10 p-3 text-xs text-info">
              <div className="flex items-start gap-2">
                <CircleArrowUp className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  yt-dlp {update.latest}{t(' disponível')}
                  <div className="text-muted">{t('você tem ')}{update.current}</div>
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
                    setToast({ msg: r.ok ? t('yt-dlp atualizado para {version}', { version: r.version ?? '' }) : t('Não consegui atualizar; veja em Configurações') })
                  }}
                >
                  {updating ? t('Atualizando…') : t('Atualizar')}
                </button>
                <button className="px-2 py-1 text-muted hover:text-text" onClick={() => setUpdate(null)}>
                  {t('Depois')}
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
              {t(!tools.ytdlp.path ? 'yt-dlp.exe não encontrado' : 'ffmpeg.exe não encontrado')}{t('. Toque para configurar.')}
            </button>
          )}
        </div>
      </aside>

      <main className="relative min-w-0 flex-1">
        <div className={cx('h-full', page !== 'download' && 'hidden')}>
          <DownloadPage ctx={ctx} />
        </div>
        {/* O editor fica montado para não perder os cortes ao trocar de aba */}
        <div className={cx('h-full', page !== 'editor' && 'hidden')}>
          <EditorPage ctx={ctx} jobs={jobs} active={page === 'editor'} source={editorSource} setSource={setEditorSource} />
        </div>
        {page === 'export' && (
          <ExportPage
            ctx={ctx}
            jobs={jobs}
            source={exportSource}
            edit={exportEdit}
            clearEdit={() => setExportEdit(null)}
            setSource={(p) => {
              // Outro vídeo: a edição era do anterior
              setExportSource(p)
              setExportEdit(null)
            }}
          />
        )}
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
