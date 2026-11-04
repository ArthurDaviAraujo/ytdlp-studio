import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  AppUpdateCheck,
  PackInfo,
  Capabilities,
  CommentsResult,
  EnhancePreview,
  ExportEstimate,
  ExportSettings,
  HelpData,
  MediaInfo,
  InfoRequest,
  InfoResult,
  Job,
  JobRequest,
  Settings,
  ToolStatus,
  UpdateCheck,
  UpdateResult
} from '../shared/types'

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch),
  getToolStatus: (refresh = false): Promise<ToolStatus> => ipcRenderer.invoke('tools:status', refresh),
  pickFolder: (current: string): Promise<string | null> => ipcRenderer.invoke('dialog:folder', current),
  pickFile: (current: string, name: string, extensions: string[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:file', current, name, extensions),
  getInfo: (req: InfoRequest): Promise<InfoResult> => ipcRenderer.invoke('info:get', req),
  cancelInfo: (): Promise<void> => ipcRenderer.invoke('info:cancel'),
  getComments: (url: string, max: number, sort: 'top' | 'new'): Promise<CommentsResult> =>
    ipcRenderer.invoke('comments:get', url, max, sort),
  getHelp: (): Promise<HelpData> => ipcRenderer.invoke('help:get'),
  updateYtdlp: (channel: string): Promise<UpdateResult> => ipcRenderer.invoke('ytdlp:update', channel),
  checkYtdlpUpdate: (): Promise<UpdateCheck> => ipcRenderer.invoke('ytdlp:check'),
  getEncoders: (): Promise<string[]> => ipcRenderer.invoke('ffmpeg:encoders'),
  getCapabilities: (): Promise<Capabilities> => ipcRenderer.invoke('ffmpeg:capabilities'),
  probeMedia: (path: string): Promise<{ ok: boolean; info: MediaInfo | null; error: string | null }> =>
    ipcRenderer.invoke('media:probe', path),
  mediaFrame: (path: string, time: number): Promise<string | null> => ipcRenderer.invoke('media:frame', path, time),
  mediaThumbs: (path: string, times: number[], width: number): Promise<(string | null)[]> => ipcRenderer.invoke('media:thumbs', path, times, width),
  mediaPeaks: (path: string, buckets: number): Promise<number[]> => ipcRenderer.invoke('media:peaks', path, buckets),
  audioDuration: (path: string): Promise<number | null> => ipcRenderer.invoke('media:audio', path),
  pickVideo: (current: string): Promise<string | null> => ipcRenderer.invoke('dialog:video', current),
  pickVideos: (current: string): Promise<string[]> => ipcRenderer.invoke('dialog:videos', current),
  listJobs: (): Promise<Job[]> => ipcRenderer.invoke('jobs:list'),
  addJob: (req: JobRequest): Promise<Job> => ipcRenderer.invoke('jobs:add', req),
  cancelJob: (id: string): Promise<void> => ipcRenderer.invoke('jobs:cancel', id),
  retryJob: (id: string): Promise<void> => ipcRenderer.invoke('jobs:retry', id),
  removeJob: (id: string): Promise<string[]> => ipcRenderer.invoke('jobs:remove', id),
  clearFinished: (): Promise<string[]> => ipcRenderer.invoke('jobs:clear'),
  getJobLog: (id: string): Promise<string[]> => ipcRenderer.invoke('jobs:log', id),
  estimateExport: (input: string, s: ExportSettings, totalOut: number): Promise<ExportEstimate> => ipcRenderer.invoke('export:estimate', input, s, totalOut),
  cancelEstimate: (): Promise<void> => ipcRenderer.invoke('export:estimate-cancel'),
  previewEnhance: (input: string, s: ExportSettings, time: number): Promise<EnhancePreview> => ipcRenderer.invoke('export:preview', input, s, time),
  cancelPreview: (): Promise<void> => ipcRenderer.invoke('export:preview-cancel'),
  mixerOpen: (size: { width: number; height: number }): Promise<void> => ipcRenderer.invoke('mixer:open', size),
  mixerClose: (): Promise<void> => ipcRenderer.invoke('mixer:close'),
  /** Do editor vai para o mixer; do mixer vai para o editor */
  mixerPost: (msg: unknown) => ipcRenderer.send('mixer:post', msg),
  onMixerMessage: (cb: (msg: unknown) => void) => {
    const h = (_e: IpcRendererEvent, msg: unknown) => cb(msg)
    ipcRenderer.on('mixer:msg', h)
    return () => {
      ipcRenderer.removeListener('mixer:msg', h)
    }
  },
  /** O processo principal pede para abrir uma página (ex.: clique no aviso do Windows) */
  checkAppUpdate: (): Promise<AppUpdateCheck> => ipcRenderer.invoke('app:update-check'),
  listPacks: (): Promise<PackInfo[]> => ipcRenderer.invoke('packs:list'),
  trackFrames: (path: string, start: number, end: number, step: number): Promise<{ t: number; data: string }[]> => ipcRenderer.invoke('media:track-frames', path, start, end, step),
  appAsset: (name: string): Promise<Uint8Array> => ipcRenderer.invoke('app:asset', name),
  installPack: (id: string): Promise<{ ok: boolean; error: string | null }> => ipcRenderer.invoke('packs:install', id),
  cancelPack: (id: string): Promise<void> => ipcRenderer.invoke('packs:cancel', id),
  removePack: (id: string): Promise<void> => ipcRenderer.invoke('packs:remove', id),
  onPackProgress: (cb: (id: string, p: number) => void) => {
    const h = (_e: IpcRendererEvent, id: string, p: number) => cb(id, p)
    ipcRenderer.on('packs:progress', h)
    return () => {
      ipcRenderer.removeListener('packs:progress', h)
    }
  },
  installAppUpdate: (url: string, size: number): Promise<{ ok: boolean; error: string | null }> => ipcRenderer.invoke('app:update-install', url, size),
  onAppUpdateProgress: (cb: (p: number) => void) => {
    const h = (_e: IpcRendererEvent, p: number) => cb(p)
    ipcRenderer.on('app:update-progress', h)
    return () => {
      ipcRenderer.removeListener('app:update-progress', h)
    }
  },
  onGoto: (cb: (page: string) => void) => {
    const h = (_e: IpcRendererEvent, page: string) => cb(page)
    ipcRenderer.on('app:goto', h)
    return () => {
      ipcRenderer.removeListener('app:goto', h)
    }
  },
  onJobsUpdate: (cb: (jobs: Job[]) => void) => {
    const h = (_e: IpcRendererEvent, jobs: Job[]) => cb(jobs)
    ipcRenderer.on('jobs:update', h)
    return () => {
      ipcRenderer.removeListener('jobs:update', h)
    }
  },
  openPath: (p: string): Promise<string> => ipcRenderer.invoke('shell:open', p),
  showInFolder: (p: string): Promise<void> => ipcRenderer.invoke('shell:show', p),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:external', url),
  readClipboard: (): Promise<string> => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write', text)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
