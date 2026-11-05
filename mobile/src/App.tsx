import { useEffect, useState } from 'react'
import { Download, ListVideo, Settings2, Wand2 } from 'lucide-react'
import { setLang, t, type Lang } from '../../src/shared/i18n'
import { engine, type EngineStatus } from './native'
import { useJobs } from './jobs'
import { cx } from './ui'
import DownloadPage from './pages/DownloadPage'
import PreparePage from './pages/PreparePage'
import QueuePage from './pages/QueuePage'
import SettingsPage from './pages/SettingsPage'
import icon from '../../src/renderer/src/assets/icon.svg'

export type Tab = 'download' | 'prepare' | 'queue' | 'settings'

export interface Ctx {
  status: EngineStatus | null
  lang: Lang
  setLangPref: (l: Lang) => void
  goTo: (t: Tab) => void
  /** Abre o Preparar com um arquivo já escolhido (ex.: botão "Preparar" de um download) */
  prepareFile: (path: string, name: string) => void
  toast: (msg: string) => void
}

const LANG_KEY = 'mobile-lang'
const UPDATE_KEY = 'mobile-ytdlp-update'

export default function App() {
  const [tab, setTab] = useState<Tab>('download')
  const [status, setStatus] = useState<EngineStatus | null>(null)
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem(LANG_KEY) as Lang) || (navigator.language.startsWith('pt') ? 'pt' : 'en'))
  const [prepIn, setPrepIn] = useState<{ path: string; name: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const jobs = useJobs()
  setLang(lang)

  useEffect(() => {
    void engine.init().then(async (s) => {
      setStatus(s)
      // Os sites mudam sempre; o yt-dlp é atualizado sozinho uma vez por dia, sem atrapalhar
      let last = 0
      try {
        last = Number(localStorage.getItem(UPDATE_KEY)) || 0
      } catch {
        /* sem armazenamento: tenta de novo na próxima abertura */
      }
      if (Date.now() - last < 24 * 3600 * 1000) return
      try {
        const r = await engine.updateYtdlp()
        localStorage.setItem(UPDATE_KEY, String(Date.now()))
        if (r.version) setStatus((p) => (p ? { ...p, ytdlp: r.version } : p))
      } catch {
        /* sem internet: fica para a próxima */
      }
    })
  }, [])
  useEffect(() => {
    if (!msg) return
    const tm = setTimeout(() => setMsg(null), 3000)
    return () => clearTimeout(tm)
  }, [msg])

  const ctx: Ctx = {
    status,
    lang,
    setLangPref: (l) => {
      localStorage.setItem(LANG_KEY, l)
      setLangState(l)
    },
    goTo: setTab,
    prepareFile: (path, name) => {
      setPrepIn({ path, name })
      setTab('prepare')
    },
    toast: setMsg
  }

  const running = jobs.filter((j) => j.status === 'running' || j.status === 'queued').length
  const tabs: { id: Tab; label: string; icon: typeof Download; badge?: number }[] = [
    { id: 'download', label: t('Baixar'), icon: Download },
    { id: 'prepare', label: t('Preparar'), icon: Wand2 },
    { id: 'queue', label: t('Downloads'), icon: ListVideo, badge: running || undefined },
    { id: 'settings', label: t('Ajustes'), icon: Settings2 }
  ]

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="safe-top flex items-center gap-2.5 border-b border-line bg-panel px-4 pb-3">
        <img src={icon} alt="" className="h-8 w-8" />
        <div className="flex-1">
          <div className="text-[16px] leading-4 font-semibold">yt-dlp GUI</div>
          <div className="text-[11px] text-muted">yt-dlp {status?.ytdlp ?? '…'}</div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'download' && <DownloadPage ctx={ctx} />}
        {tab === 'prepare' && <PreparePage ctx={ctx} initial={prepIn} clearInitial={() => setPrepIn(null)} />}
        {tab === 'queue' && <QueuePage ctx={ctx} jobs={jobs} />}
        {tab === 'settings' && <SettingsPage ctx={ctx} />}
      </main>

      {msg && <div className="pointer-events-none fixed inset-x-4 bottom-24 z-50 rounded-xl bg-panel-3 px-4 py-3 text-center text-sm shadow-2xl ring-1 ring-line">{msg}</div>}

      <nav className="safe-bottom grid grid-cols-4 border-t border-line bg-panel pt-1.5">
        {tabs.map((x) => (
          <button key={x.id} onClick={() => setTab(x.id)} className={cx('relative flex flex-col items-center gap-0.5 py-1 text-[11px]', tab === x.id ? 'text-accent' : 'text-muted')}>
            <span className={cx('flex h-7 w-14 items-center justify-center rounded-full transition-colors', tab === x.id && 'bg-accent/15')}>
              <x.icon className="h-5 w-5" />
            </span>
            {x.label}
            {x.badge != null && <span className="absolute top-0 right-[calc(50%-24px)] rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">{x.badge}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}
