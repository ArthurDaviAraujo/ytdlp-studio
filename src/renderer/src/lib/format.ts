const nf = new Intl.NumberFormat('pt-BR')
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const compactNf = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

export const num = (n?: number | null) => (n == null ? '—' : nf.format(n))
export const compact = (n?: number | null) => (n == null ? '—' : compactNf.format(n))

export function bytes(n?: number | null): string {
  if (n == null || !isFinite(n)) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${i === 0 ? Math.round(n) : nf1.format(n)} ${units[i]}`
}

export function duration(sec?: number | null): string {
  if (sec == null || !isFinite(sec)) return '—'
  sec = Math.round(sec)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** "20240131" → "31 de jan. de 2024" */
export function ymd(s?: string | null): string {
  if (!s || !/^\d{8}$/.test(s)) return s ?? '—'
  const d = new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)))
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function epoch(ts?: number | null): string {
  if (ts == null) return '—'
  return new Date(ts * 1000).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })
}

export function kbps(n?: number | null): string {
  if (n == null) return '—'
  return n >= 1000 ? `${nf1.format(n / 1000)} Mbps` : `${Math.round(n)} kbps`
}

export const speed = (n?: number | null) => (n == null ? '—' : `${bytes(n)}/s`)

/** "01:02:03" | "62:03" | "3723" | "1h2m3s" → segundos */
export function parseTime(s: string): number | null {
  s = s.trim()
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  const parts = s.split(':').map(Number)
  if (parts.some((p) => isNaN(p))) return null
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}
