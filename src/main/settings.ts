import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Settings } from '../shared/types'

const file = () => join(app.getPath('userData'), 'settings.json')

function defaults(): Settings {
  return {
    ytdlpPath: '',
    ffmpegPath: '',
    rifePath: '',
    jsRuntime: 'auto',
    jsRuntimePath: '',
    downloadDir: app.getPath('downloads'),
    outputTemplate: '%(title)s [%(id)s].%(ext)s',
    concurrency: 2,
    exportPresets: [],
    checkUpdates: true
  }
}

let current: Settings | null = null

export function getSettings(): Settings {
  if (current) return current
  current = defaults()
  try {
    if (existsSync(file())) current = { ...current, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {
    // arquivo corrompido: segue com os padrões
  }
  return current!
}

export function setSettings(patch: Partial<Settings>): Settings {
  current = { ...getSettings(), ...patch }
  const d = defaults()
  current.downloadDir = current.downloadDir.trim() || d.downloadDir
  current.outputTemplate = current.outputTemplate.trim() || d.outputTemplate
  current.concurrency = Math.min(5, Math.max(1, Math.round(current.concurrency || 1)))
  writeFileSync(file(), JSON.stringify(current, null, 2))
  return current
}
