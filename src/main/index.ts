import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import type { JobRequest, Settings } from '../shared/types'
import { getSettings, setSettings } from './settings'
import { ensureBundledBinaries, getToolStatus } from './tools'
import { cancelInfo, checkYtdlpUpdate, getComments, getHelp, getInfo, updateYtdlp } from './ytdlp'
import { frcAmfWorks, listH264Encoders } from './convert'
import { frame, probe } from './media'
import * as jobs from './jobs'

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
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const s = setSettings(patch)
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
      filters: [{ name, extensions }, { name: 'Todos os arquivos', extensions: ['*'] }]
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
    const [encoders, frcAmf] = await Promise.all([listH264Encoders(), frcAmfWorks()])
    return { encoders, frcAmf }
  })
  ipcMain.handle('media:probe', async (_e, path: string) => {
    try {
      return { ok: true, info: await probe(path), error: null }
    } catch (e) {
      return { ok: false, info: null, error: (e as Error).message }
    }
  })
  ipcMain.handle('media:frame', (_e, path: string, time: number) => frame(path, time))
  ipcMain.handle('dialog:video', async (e, current: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      defaultPath: current || undefined,
      properties: ['openFile'],
      filters: [
        { name: 'Vídeos', extensions: ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v', 'ts', 'flv', 'wmv'] },
        { name: 'Todos os arquivos', extensions: ['*'] }
      ]
    })
    return r.canceled ? null : r.filePaths[0]
  })
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
  ensureBundledBinaries()
  jobs.loadHistory()
  registerIpc()
  createWindow()
})

app.on('before-quit', () => jobs.cancelAll())
app.on('window-all-closed', () => app.quit())
