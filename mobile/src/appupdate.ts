/**
 * Aviso de versão nova do app de celular. As versões saem no GitHub como `android-vX.Y.Z` (sem marcar como "latest",
 * que é do app de PC), cada uma com um APK por arquitetura. O app não instala sozinho: abre o APK no navegador,
 * que baixa, e o Android pede para instalar por cima.
 */

const REPO = 'ArthurDaviAraujo/ytdlp-studio'
const CACHE_KEY = 'mobile-app-update'
/** Pergunta ao GitHub no máximo a cada 6 h (sem login, o GitHub aceita 60 consultas por hora) */
const EVERY = 6 * 3600 * 1000

export interface AppUpdate {
  version: string
  /** O APK desta arquitetura ou, se não houver, a página da versão */
  url: string
}

/** "1.0.10" > "1.0.9" */
export function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d > 0
  }
  return false
}

interface Release {
  tag_name: string
  html_url: string
  draft: boolean
  assets: { name: string; browser_download_url: string }[]
}

async function latestAndroid(abi: string | null | undefined): Promise<AppUpdate | null> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!r.ok) throw new Error(`GitHub ${r.status}`)
  const list = (await r.json()) as Release[]
  let best: { v: string; rel: Release } | null = null
  for (const rel of list) {
    const m = /^android-v(\d+(?:\.\d+)*)$/.exec(rel.tag_name)
    if (!m || rel.draft) continue
    if (!best || newer(m[1], best.v)) best = { v: m[1], rel }
  }
  if (!best) return null
  // arm64-v8a → "arm64"; x86_64 → "x86_64"
  const key = abi?.startsWith('arm64') ? 'arm64' : abi ?? ''
  const apk = best.rel.assets.find((a) => a.name.endsWith('.apk') && key && a.name.includes(key))
  return { version: best.v, url: apk?.browser_download_url ?? best.rel.html_url }
}

/** Devolve a versão nova, se houver. `force` ignora o intervalo de 6 h (botão nos Ajustes). */
export async function checkAppUpdate(abi: string | null | undefined, force = false): Promise<AppUpdate | null> {
  let cached: { at: number; found: AppUpdate | null } | null = null
  try {
    cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
  } catch {
    /* sem armazenamento: pergunta ao GitHub */
  }
  let found: AppUpdate | null
  if (!force && cached && Date.now() - cached.at < EVERY) {
    found = cached.found
  } else {
    found = await latestAndroid(abi)
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), found }))
    } catch {
      /* tudo bem: pergunta de novo na próxima abertura */
    }
  }
  return found && newer(found.version, __APP_VERSION__) ? found : null
}
