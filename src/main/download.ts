import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { dirname } from 'path'
import { t } from '../shared/i18n'

/**
 * Baixa `url` para `file` mostrando o progresso (0–100). Grava num ".part" e só renomeia no fim, então um download
 * interrompido nunca parece completo. Se o arquivo já está lá com o tamanho certo, não baixa de novo.
 */
export async function downloadTo(url: string, file: string, size: number, onProgress: (p: number) => void, isCanceled: () => boolean = () => false): Promise<string | null> {
  if (existsSync(file) && size > 0 && statSync(file).size === size) {
    onProgress(100)
    return null
  }
  mkdirSync(dirname(file), { recursive: true })
  const r = await fetch(url, { headers: { 'User-Agent': 'ytdlp-studio' } })
  if (!r.ok || !r.body) return t('Download respondeu {status}', { status: r.status })
  const total = Number(r.headers.get('content-length') ?? 0) || size
  const part = file + '.part'
  const out = createWriteStream(part)
  let got = 0
  const reader = r.body.getReader()
  try {
    for (;;) {
      if (isCanceled()) {
        await reader.cancel()
        throw new Error(t('Cancelado'))
      }
      const { done, value } = await reader.read()
      if (done) break
      got += value.length
      if (!out.write(value)) await new Promise((res) => out.once('drain', res))
      if (total) onProgress(Math.min(99.9, (got / total) * 100))
    }
  } catch (e) {
    out.destroy()
    rmSync(part, { force: true })
    return (e as Error).message
  }
  await new Promise<void>((res, rej) => out.end((err?: Error | null) => (err ? rej(err) : res())))
  if (total && got !== total) {
    rmSync(part, { force: true })
    return t('O download veio incompleto ({got} de {total} bytes)', { got, total })
  }
  rmSync(file, { force: true })
  renameSync(part, file)
  onProgress(100)
  return null
}
