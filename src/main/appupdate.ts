import { app } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'
import type { AppUpdateCheck } from '../shared/types'
import { t } from '../shared/i18n'
import { downloadTo } from './download'

const REPO = 'ArthurDaviAraujo/ytdlp-studio'

/** "1.10.0" > "1.9.2" */
function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0
  }
  return false
}

/** Pergunta ao GitHub qual é a última versão do app e onde está o instalador */
export async function checkAppUpdate(current = app.getVersion()): Promise<AppUpdateCheck> {
  const none = (error: string | null): AppUpdateCheck => ({ current, latest: null, newer: false, url: null, size: 0, page: null, error })
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ytdlp-studio' } })
    if (!r.ok) return none(t('GitHub respondeu {status}', { status: r.status }))
    const j = (await r.json()) as { tag_name?: string; html_url?: string; assets?: { name: string; size: number; browser_download_url: string }[] }
    const latest = (j.tag_name ?? '').replace(/^v/, '')
    const exe = j.assets?.find((a) => /\.exe$/i.test(a.name))
    return { current, latest, newer: !!latest && newer(latest, current), url: exe?.browser_download_url ?? null, size: exe?.size ?? 0, page: j.html_url ?? null, error: null }
  } catch (e) {
    return none((e as Error).message)
  }
}

let busy = false

/**
 * Baixa o instalador novo para a pasta temporária (mostrando o progresso) e, se `run`, abre o instalador e fecha o app.
 * Um download completo que já está lá é reaproveitado.
 */
export async function installAppUpdate(url: string, size: number, onProgress: (p: number) => void, run = true): Promise<{ ok: boolean; error: string | null; file: string | null }> {
  if (busy) return { ok: false, error: t('A atualização já está sendo baixada'), file: null }
  busy = true
  const name = decodeURIComponent(url.split('/').pop() ?? 'ytdlp-studio-Setup.exe').replace(/[\\/:*?"<>|]/g, '_')
  const file = join(app.getPath('temp'), name)
  try {
    const err = await downloadTo(url, file, size, onProgress)
    if (err) return { ok: false, error: err, file: null }
    // Em desenvolvimento só baixa: abrir o instalador trocaria o app instalado, não o projeto
    if (run && app.isPackaged) {
      // O instalador roda sozinho, fora do app; o app fecha para os arquivos poderem ser trocados
      const child = spawn(file, [], { detached: true, stdio: 'ignore' })
      child.on('error', () => {})
      child.unref()
      setTimeout(() => app.quit(), 800)
    }
    return { ok: true, error: null, file }
  } catch (e) {
    return { ok: false, error: (e as Error).message, file: null }
  } finally {
    busy = false
  }
}
