import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  Capabilities,
  CommentsResult,
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
  pickVideo: (current: string): Promise<string | null> => ipcRenderer.invoke('dialog:video', current),
  listJobs: (): Promise<Job[]> => ipcRenderer.invoke('jobs:list'),
  addJob: (req: JobRequest): Promise<Job> => ipcRenderer.invoke('jobs:add', req),
  cancelJob: (id: string): Promise<void> => ipcRenderer.invoke('jobs:cancel', id),
  retryJob: (id: string): Promise<void> => ipcRenderer.invoke('jobs:retry', id),
  removeJob: (id: string): Promise<string[]> => ipcRenderer.invoke('jobs:remove', id),
  clearFinished: (): Promise<string[]> => ipcRenderer.invoke('jobs:clear'),
  getJobLog: (id: string): Promise<string[]> => ipcRenderer.invoke('jobs:log', id),
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
