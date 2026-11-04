import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import type { ExportSettings, JobRequest, Settings } from '../shared/types'
import { getSettings, setSettings } from './settings'
import { ensureBundledBinaries, getToolStatus } from './tools'
import { cancelInfo, checkYtdlpUpdate, getComments, getHelp, getInfo, updateYtdlp } from './ytdlp'
import { frcAmfWorks, listH264Encoders, listRifeGpus } from './convert'
import { audioDuration, frame, peaks, probe, thumbs } from './media'
import * as jobs from './jobs'
import { cancelEstimate, cancelPreview, estimateExport, previewEnhance } from './export'
import { setLang, t } from '../shared/i18n'

let mainWin: BrowserWindow | null = null
let mixerWin: BrowserWindow | null = null

const loadRenderer = (w: BrowserWindow, hash = '') => {
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL + (hash ? `#${hash}` : ''))
  else void w.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
}

/** Mixer numa janela própria: vai para qualquer lugar da tela, sempre por cima da janela principal (filha dela). */
function openMixer(size: { width: number; height: number }): void {
  if (!mainWin) return
  if (mixerWin && !mixerWin.isDestroyed()) {
    mixerWin.setContentSize(size.width, size.height)
    mixerWin.focus()
    return
  }
  const b = mainWin.getBounds()
  mixerWin = new BrowserWindow({
    parent: mainWin,
    width: size.width,
    height: size.height,
    useContentSize: true,
    x: b.x + b.width - size.width - 60,
    y: b.y + 140,
    frame: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#0b0d12',
    title: 'Mixer',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  mixerWin.on('ready-to-show', () => mixerWin?.show())
  mixerWin.on('closed', () => {
    mixerWin = null
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('mixer:msg', { type: 'closed' })
  })
  loadRenderer(mixerWin, 'mixer')
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    title: 'yt-dlp GUI',
    // No app instalado o ícone vem do próprio .exe; em desenvolvimento, da pasta build
    ...(app.isPackaged ? {} : { icon: join(app.getAppPath(), 'build', 'icon.png') }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.on('ready-to-show', () => win.show())
  // Links da descrição, canais etc. abrem no navegador do sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  jobs.attach(win.webContents)
  loadRenderer(win)
  mainWin = win
  return win
}

function registerIpc(): void {
  // Mixer: o editor manda o estado e os níveis; o mixer devolve o que a pessoa mexe
  ipcMain.handle('mixer:open', (_e, size: { width: number; height: number }) => openMixer(size))
  ipcMain.handle('mixer:close', () => mixerWin?.close())
  ipcMain.on('mixer:post', (e, msg: unknown) => {
    const fromMixer = mixerWin && !mixerWin.isDestroyed() && e.sender === mixerWin.webContents
    const to = fromMixer ? mainWin : mixerWin
    if (to && !to.isDestroyed()) to.webContents.send('mixer:msg', msg)
  })
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const s = setSettings(patch)
    setLang(s.language)
    getToolStatus(true)
    return s
  })
  ipcMain.handle('tools:status', (_e, refresh: boolean) => getToolStatus(refresh))
  ipcMain.handle('dialog:folder', async (e, current: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, { defaultPath: current, properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:file', async (e, current: string, name: string, extensions: string[]) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      defaultPath: current || undefined,
      properties: ['openFile'],
      filters: [{ name, extensions }, { name: t('Todos os arquivos'), extensions: ['*'] }]
    })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('info:get', (_e, req) => getInfo(req))
  ipcMain.handle('info:cancel', () => cancelInfo())
  ipcMain.handle('comments:get', (_e, url: string, max: number, sort: 'top' | 'new') => getComments(url, max, sort))
  ipcMain.handle('help:get', () => getHelp())
  ipcMain.handle('ytdlp:update', (_e, channel: string) => updateYtdlp(channel))
  ipcMain.handle('ytdlp:check', () => checkYtdlpUpdate())
  ipcMain.handle('ffmpeg:encoders', () => listH264Encoders())
  ipcMain.handle('ffmpeg:capabilities', async () => {
    const [encoders, frcAmf, gpus] = await Promise.all([listH264Encoders(), frcAmfWorks(), listRifeGpus()])
    return { encoders, frcAmf, gpus }
  })
  ipcMain.handle('media:probe', async (_e, path: string) => {
    try {
      return { ok: true, info: await probe(path), error: null }
    } catch (e) {
      return { ok: false, info: null, error: (e as Error).message }
    }
  })
  ipcMain.handle('media:frame', (_e, path: string, time: number) => frame(path, time))
  ipcMain.handle('media:thumbs', (_e, path: string, times: number[], width: number) => thumbs(path, times, width))
  ipcMain.handle('media:peaks', (_e, path: string, buckets: number) => peaks(path, buckets))
  ipcMain.handle('media:audio', (_e, path: string) => audioDuration(path))
  ipcMain.handle('dialog:video', async (e, current: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      defaultPath: current || undefined,
      properties: ['openFile'],
      filters: [
        { name: t('Vídeos'), extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'ts', 'flv', 'wmv'] },
        { name: t('Todos os arquivos'), extensions: ['*'] }
      ]
    })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('export:estimate', (_e, input: string, s: ExportSettings, totalOut: number) => estimateExport(input, s, totalOut))
  ipcMain.handle('export:estimate-cancel', () => cancelEstimate())
  ipcMain.handle('export:preview', (_e, input: string, s: ExportSettings, time: number) => previewEnhance(input, s, time))
  ipcMain.handle('export:preview-cancel', () => cancelPreview())
  ipcMain.handle('jobs:list', () => jobs.listJobs())
  ipcMain.handle('jobs:add', (_e, req: JobRequest) => jobs.addJob(req))
  ipcMain.handle('jobs:cancel', (_e, id: string) => jobs.cancelJob(id))
  ipcMain.handle('jobs:retry', (_e, id: string) => jobs.retryJob(id))
  ipcMain.handle('jobs:remove', (_e, id: string) => jobs.removeJob(id))
  ipcMain.handle('jobs:clear', () => jobs.clearFinished())
  ipcMain.handle('jobs:log', (_e, id: string) => jobs.getJobLog(id))
  ipcMain.handle('shell:open', (_e, p: string) => shell.openPath(p))
  ipcMain.handle('shell:show', (_e, p: string) => shell.showItemInFolder(p))
  ipcMain.handle('shell:external', (_e, url: string) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
  })
  ipcMain.handle('clipboard:read', () => clipboard.readText())
  ipcMain.handle('clipboard:write', (_e, text: string) => clipboard.writeText(text))
}

app.whenReady().then(() => {
  setLang(getSettings().language)
  ensureBundledBinaries()
  jobs.loadHistory()
  registerIpc()
  createWindow()
})

app.on('before-quit', () => jobs.cancelAll())
app.on('window-all-closed', () => app.quit())
