import { en } from './i18n-en'

export type Lang = 'en' | 'pt'

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'pt', label: 'Português (Brasil)' }
]

let lang: Lang = 'en'

export const setLang = (l: Lang): void => {
  lang = l === 'pt' ? 'pt' : 'en'
}
export const getLang = (): Lang => lang
/** Locale para números e datas */
export const locale = (): string => (lang === 'pt' ? 'pt-BR' : 'en-US')

/**
 * Traduz um texto. A chave é o próprio texto em português; `{nome}` é trocado pelos valores.
 * Sem tradução, devolve o português.
 */
export function t(pt: string, vars?: Record<string, string | number>): string {
  let s = lang === 'en' ? (en[pt] ?? pt) : pt
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}
