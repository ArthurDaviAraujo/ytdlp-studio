import { app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { cpus } from 'os'
import { dirname, join } from 'path'
import { createHash } from 'crypto'
import type { SubtitleSettings } from '../shared/types'
import type { Word } from '../shared/subtitles'
import { getToolStatus, whisperModelPath } from './tools'
import { capture } from './media'
import { t } from '../shared/i18n'

const cache = new Map<string, Word[]>()

/**
 * Transcreve o trecho [start, start+dur] com o Whisper, palavra por palavra (-ml 1 -sow), e devolve as palavras com os
 * tempos contados a partir do início do trecho. O resultado fica guardado: medir o tempo e preparar não transcrevem duas vezes.
 */
export async function transcribe(
  input: string,
  start: number,
  dur: number,
  sub: SubtitleSettings,
  onProgress: (p: number) => void,
  onChild: (c: ChildProcess | null) => void,
  log: (l: string) => void
): Promise<Word[] | string> {
  const tools = getToolStatus()
  const exe = tools.whisper.exe
  if (!exe) return t('O Whisper (legendas) ainda não foi baixado. Baixe em Configurações → IAs.')
  const model = whisperModelPath(sub.model)
  if (!model) return t('O modelo de legenda escolhido ainda não foi baixado. Baixe em Configurações → IAs.')
  const ffmpeg = tools.ffmpeg.path
  if (!ffmpeg) return t('ffmpeg.exe não encontrado')

  const key = createHash('sha1').update(JSON.stringify([input, start.toFixed(3), dur.toFixed(3), sub.model, sub.language, sub.translate])).digest('hex')
  const hit = cache.get(key)
  if (hit) return hit

  const dir = join(app.getPath('temp'), `ytdlp-gui-legenda-${key.slice(0, 12)}`)
  mkdirSync(dir, { recursive: true })
  try {
    const wav = join(dir, 'audio.wav')
    // O Whisper trabalha com áudio mono a 16 kHz
    const ex = await capture(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-ss', start.toFixed(3), '-t', dur.toFixed(3), '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav])
    if (ex.code !== 0 || !existsSync(wav)) return ex.err.trim().split(/\r?\n/).slice(-2).join(' ') || t('O vídeo não tem áudio para legendar')
    // Silêncio no começo: o Whisper costuma marcar a 1ª palavra em 0 s mesmo quando a fala começa depois.
    // O silêncio é cortado antes e o tempo dele é somado de volta nas palavras.
    let offset = 0
    let audio = wav
    const sd = await capture(ffmpeg, ['-hide_banner', '-i', wav, '-af', 'silencedetect=n=-38dB:d=0.4', '-f', 'null', '-'])
    const first = sd.err.match(/silence_start: (-?[\d.]+)[\s\S]*?silence_end: ([\d.]+)/)
    if (first && Number(first[1]) <= 0.05 && Number(first[2]) > 0.5) {
      offset = Math.max(0, Number(first[2]) - 0.15)
      audio = join(dir, 'fala.wav')
      await capture(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-ss', offset.toFixed(3), '-i', wav, '-c:a', 'pcm_s16le', audio])
    }
    const out = join(dir, 'palavras')
    const threads = String(Math.max(2, Math.min(16, cpus().length - 1)))
    const args = ['-m', model, '-f', audio, '-l', sub.language || 'auto', '-ml', '1', '-sow', '-oj', '-of', out, '-t', threads, '-pp', '-np']
    if (sub.translate) args.push('-tr')
    log(`> ${exe} ${args.join(' ')}`)
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(exe, args, { windowsHide: true, cwd: dirname(exe) })
      onChild(child)
      const onData = (d: Buffer) => {
        for (const l of d.toString('utf8').split(/\r?\n/)) {
          const m = l.match(/progress\s*=\s*(\d+)%/)
          if (m) onProgress(Number(m[1]))
        }
      }
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)
      child.on('error', () => resolve(-1))
      child.on('close', (c) => {
        onChild(null)
        resolve(c)
      })
    })
    if (code !== 0 || !existsSync(out + '.json')) return t('O Whisper falhou (código {code})', { code: String(code) })
    const j = JSON.parse(readFileSync(out + '.json', 'utf8')) as { transcription?: { offsets: { from: number; to: number }; text: string }[] }
    const words: Word[] = []
    for (const s of j.transcription ?? []) {
      const text = s.text.trim()
      // Marcas do Whisper como [Música] ou (risos) não são fala
      if (!text || /^[[(].*[\])]$/.test(text)) continue
      words.push({ text, start: offset + s.offsets.from / 1000, end: offset + Math.max(s.offsets.to, s.offsets.from + 80) / 1000 })
    }
    cache.set(key, words)
    log('[app] ' + t('Legendas: {n} palavras', { n: words.length }))
    return words
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
