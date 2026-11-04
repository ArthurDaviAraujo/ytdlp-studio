import { spawn } from 'child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import type { PackInfo } from '../shared/types'
import { PACKS, packFor } from '../shared/packs'
import { getToolStatus, searchDirs, userBin } from './tools'
import { downloadTo } from './download'
import { t } from '../shared/i18n'

/** Está em alguma das pastas de programas (a do app instalado, a gravável ou a do projeto)? */
export const packInstalled = (check: string) => searchDirs().some((d) => existsSync(join(d, check)))

export function listPacks(): PackInfo[] {
  return PACKS.map((p) => ({ id: p.id, name: p.name, size: p.size, installed: packInstalled(p.check) }))
}

const running = new Map<string, { canceled: boolean }>()

export function cancelPack(id: string): void {
  const r = running.get(id)
  if (r) r.canceled = true
}

/** Extrai um .zip com o tar do Windows (vem no Windows 10 e 11) */
function unzip(zip: string, dir: string): Promise<string | null> {
  return new Promise((resolve) => {
    mkdirSync(dir, { recursive: true })
    // O tar do Windows (System32) entende .zip; o do PATH pode ser outro (ex.: o do Git)
    const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    const child = spawn(existsSync(tar) ? tar : 'tar', ['-xf', zip, '-C', dir], { windowsHide: true })
    let err = ''
    child.stderr.on('data', (d: Buffer) => (err += d.toString('utf8')))
    child.on('error', (e) => resolve(e.message))
    child.on('close', (code) => resolve(code === 0 ? null : err.trim() || t('Não consegui extrair o arquivo')))
  })
}

/** Baixa (e extrai, se for .zip) para a pasta gravável de programas do app */
export async function installPack(id: string, onProgress: (p: number) => void): Promise<{ ok: boolean; error: string | null }> {
  const def = packFor(id)
  if (!def) return { ok: false, error: t('Pacote desconhecido') }
  if (running.has(id)) return { ok: false, error: t('Já está baixando') }
  const state = { canceled: false }
  running.set(id, state)
  try {
    const base = userBin()
    if (def.zip) {
      const zip = join(base, `${def.id}.zip`)
      const err = await downloadTo(def.url, zip, def.size, (p) => onProgress(p * 0.92), () => state.canceled)
      if (err) return { ok: false, error: err }
      onProgress(95)
      // Extrai por cima (sem apagar antes): a pasta do Whisper guarda os modelos já baixados
      const dir = join(base, def.zip)
      const ex = await unzip(zip, dir)
      rmSync(zip, { force: true })
      if (ex) return { ok: false, error: ex }
      if (!existsSync(join(base, def.check))) return { ok: false, error: t('O pacote não trouxe o que era esperado ({file})', { file: def.check }) }
    } else {
      const file = join(base, def.check)
      mkdirSync(dirname(file), { recursive: true })
      const err = await downloadTo(def.url, file, def.size, onProgress, () => state.canceled)
      if (err) return { ok: false, error: err }
    }
    onProgress(100)
    getToolStatus(true)
    return { ok: true, error: null }
  } finally {
    running.delete(id)
  }
}

/** Apaga só a cópia baixada (a que veio no instalador ou no projeto fica) */
export function removePack(id: string): void {
  const def = packFor(id)
  if (!def) return
  const target = join(userBin(), def.zip ?? def.check)
  // Apagar o programa do Whisper não leva junto os modelos de legenda baixados
  if (def.zip && existsSync(join(target, 'models'))) {
    for (const f of readdirSync(target)) if (f !== 'models') rmSync(join(target, f), { recursive: true, force: true })
  } else rmSync(target, { recursive: true, force: true })
  getToolStatus(true)
}
