import { app } from 'electron'
import { spawn } from 'child_process'
import { existsSync, mkdirSync, openSync, closeSync, writeSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import type * as Ort from 'onnxruntime-node'
import { getToolStatus } from './tools'
import { capture } from './media'
import { t } from '../shared/i18n'

/**
 * Separar voz e música com o modelo Kim Vocal 2 (UVR MDX-Net) no ONNX Runtime, na placa de vídeo (DirectML).
 * O modelo recebe o espectro (STFT) de pedaços de ~6 s do áudio estéreo a 44,1 kHz e devolve o espectro da voz;
 * a música é o áudio original menos a voz. Parâmetros do modelo (os mesmos do UVR): n_fft 7680, hop 1024,
 * 3072 faixas de frequência e 256 quadros por pedaço.
 */
const N_FFT = 7680
const HOP = 1024
const DIM_F = 3072
const DIM_T = 256
const CHUNK = HOP * (DIM_T - 1) // 261120 amostras
const TRIM = N_FFT / 2
const GEN = CHUNK - 2 * TRIM
const BINS = N_FFT / 2 + 1
const RATE = 44100
/** Ajuste de volume do UVR para este modelo */
const COMPENSATE = 1.009

// ---------- FFT (radix 2) e Bluestein para o tamanho 7680, que não é potência de 2 ----------

const M = 16384 // potência de 2 >= 2·7680−1
const rev = new Uint32Array(M)
const cosT = new Float64Array(M / 2)
const sinT = new Float64Array(M / 2)
;(() => {
  const bits = Math.log2(M)
  for (let i = 0; i < M; i++) {
    let r = 0
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
    rev[i] = r
  }
  for (let i = 0; i < M / 2; i++) {
    cosT[i] = Math.cos((2 * Math.PI * i) / M)
    sinT[i] = -Math.sin((2 * Math.PI * i) / M)
  }
})()

/** FFT complexa no lugar, tamanho M; inverse = conjugada (sem dividir por M) */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  for (let i = 0; i < M; i++) {
    const j = rev[i]
    if (j > i) {
      let tmp = re[i]
      re[i] = re[j]
      re[j] = tmp
      tmp = im[i]
      im[i] = im[j]
      im[j] = tmp
    }
  }
  for (let size = 2; size <= M; size <<= 1) {
    const half = size >> 1
    const step = M / size
    for (let i = 0; i < M; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = cosT[k]
        const wi = inverse ? -sinT[k] : sinT[k]
        const a = i + j
        const b = a + half
        const xr = re[b] * wr - im[b] * wi
        const xi = re[b] * wi + im[b] * wr
        re[b] = re[a] - xr
        im[b] = im[a] - xi
        re[a] += xr
        im[a] += xi
      }
    }
  }
}

// Chirp do Bluestein: w_n = e^(−iπn²/N); B = FFT do filtro conjugado
const wRe = new Float64Array(N_FFT)
const wIm = new Float64Array(N_FFT)
const bRe = new Float64Array(M)
const bIm = new Float64Array(M)
;(() => {
  for (let n = 0; n < N_FFT; n++) {
    const a = (Math.PI * ((n * n) % (2 * N_FFT))) / N_FFT
    wRe[n] = Math.cos(a)
    wIm[n] = -Math.sin(a)
  }
  bRe[0] = wRe[0]
  bIm[0] = -wIm[0]
  for (let n = 1; n < N_FFT; n++) {
    bRe[n] = bRe[M - n] = wRe[n]
    bIm[n] = bIm[M - n] = -wIm[n]
  }
  fft(bRe, bIm, false)
})()

const aRe = new Float64Array(M)
const aIm = new Float64Array(M)

/** DFT de tamanho 7680 (complexa) pelo Bluestein; resultado em outRe/outIm */
function dft(inRe: Float64Array, inIm: Float64Array, outRe: Float64Array, outIm: Float64Array): void {
  aRe.fill(0)
  aIm.fill(0)
  for (let n = 0; n < N_FFT; n++) {
    aRe[n] = inRe[n] * wRe[n] - inIm[n] * wIm[n]
    aIm[n] = inRe[n] * wIm[n] + inIm[n] * wRe[n]
  }
  fft(aRe, aIm, false)
  for (let k = 0; k < M; k++) {
    const r = aRe[k] * bRe[k] - aIm[k] * bIm[k]
    aIm[k] = aRe[k] * bIm[k] + aIm[k] * bRe[k]
    aRe[k] = r
  }
  fft(aRe, aIm, true)
  for (let k = 0; k < N_FFT; k++) {
    const r = aRe[k] / M
    const i = aIm[k] / M
    outRe[k] = r * wRe[k] - i * wIm[k]
    outIm[k] = r * wIm[k] + i * wRe[k]
  }
}

// Janela de Hann "periódica" (a do torch.stft)
const win = new Float64Array(N_FFT)
for (let n = 0; n < N_FFT; n++) win[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N_FFT)

const fRe = new Float64Array(N_FFT)
const fIm = new Float64Array(N_FFT)
const gRe = new Float64Array(N_FFT)
const gIm = new Float64Array(N_FFT)

/**
 * STFT dos dois canais de um pedaço (CHUNK amostras) → tensor [4, DIM_F, DIM_T] na ordem do UVR:
 * L real, L imag, R real, R imag. Igual ao torch.stft com center=True (borda refletida).
 */
function stft(L: Float32Array, R: Float32Array, off: number, out: Float32Array): void {
  const pad = N_FFT / 2
  const at = (x: Float32Array, i: number) => {
    // posição no pedaço com borda refletida
    let p = i - pad
    if (p < 0) p = -p
    if (p >= CHUNK) p = 2 * (CHUNK - 1) - p
    return x[off + p]
  }
  for (let t0 = 0; t0 < DIM_T; t0++) {
    const s = t0 * HOP
    // Os dois canais numa DFT só: z = L + iR
    for (let n = 0; n < N_FFT; n++) {
      fRe[n] = at(L, s + n) * win[n]
      fIm[n] = at(R, s + n) * win[n]
    }
    dft(fRe, fIm, gRe, gIm)
    for (let f = 0; f < DIM_F; f++) {
      const k2 = f === 0 ? 0 : N_FFT - f
      // L_k = (Z_k + conj Z_(N−k)) / 2 ; R_k = (Z_k − conj Z_(N−k)) / 2i
      const lr = (gRe[f] + gRe[k2]) / 2
      const li = (gIm[f] - gIm[k2]) / 2
      const rr = (gIm[f] + gIm[k2]) / 2
      const ri = (gRe[k2] - gRe[f]) / 2
      out[(0 * DIM_F + f) * DIM_T + t0] = lr
      out[(1 * DIM_F + f) * DIM_T + t0] = li
      out[(2 * DIM_F + f) * DIM_T + t0] = rr
      out[(3 * DIM_F + f) * DIM_T + t0] = ri
    }
  }
}

const envelope = (() => {
  // Soma das janelas² sobrepostas (para desfazer a janela no ISTFT)
  const len = N_FFT + HOP * (DIM_T - 1)
  const e = new Float64Array(len)
  for (let t0 = 0; t0 < DIM_T; t0++) for (let n = 0; n < N_FFT; n++) e[t0 * HOP + n] += win[n] * win[n]
  return e
})()

/** ISTFT do tensor [4, DIM_F, DIM_T] → dois canais de CHUNK amostras (faixas acima de DIM_F ficam zeradas) */
function istft(spec: Float32Array, outL: Float64Array, outR: Float64Array): void {
  const len = N_FFT + HOP * (DIM_T - 1)
  const accL = new Float64Array(len)
  const accR = new Float64Array(len)
  for (let t0 = 0; t0 < DIM_T; t0++) {
    // Espectro completo de L e R (simetria conjugada) e as duas IFFTs numa só: z = l + i·r
    fRe.fill(0)
    fIm.fill(0)
    for (let f = 0; f < DIM_F; f++) {
      const lr = spec[(0 * DIM_F + f) * DIM_T + t0]
      const li = spec[(1 * DIM_F + f) * DIM_T + t0]
      const rr = spec[(2 * DIM_F + f) * DIM_T + t0]
      const ri = spec[(3 * DIM_F + f) * DIM_T + t0]
      // Z_k = L_k + i R_k
      fRe[f] = lr - ri
      fIm[f] = li + rr
      if (f > 0 && f < BINS - 1) {
        // Z_(N−k) = conj(L_k) + i conj(R_k)
        fRe[N_FFT - f] = lr + ri
        fIm[N_FFT - f] = -li + rr
      }
    }
    // IDFT(z) = conj(DFT(conj z)) / N
    for (let n = 0; n < N_FFT; n++) fIm[n] = -fIm[n]
    dft(fRe, fIm, gRe, gIm)
    const s = t0 * HOP
    for (let n = 0; n < N_FFT; n++) {
      const l = gRe[n] / N_FFT
      const r = -gIm[n] / N_FFT
      accL[s + n] += l * win[n]
      accR[s + n] += r * win[n]
    }
  }
  const pad = N_FFT / 2
  for (let i = 0; i < CHUNK; i++) {
    const e = envelope[i + pad] || 1
    outL[i] = accL[i + pad] / e
    outR[i] = accR[i + pad] / e
  }
}

// ---------- Modelo ----------

let session: Promise<Ort.InferenceSession> | null = null
let sessionModel = ''

async function getSession(model: string, log: (l: string) => void): Promise<Ort.InferenceSession> {
  if (session && sessionModel === model) return session
  sessionModel = model
  session = (async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ort = require('onnxruntime-node') as typeof Ort
    try {
      const s = await ort.InferenceSession.create(model, { executionProviders: ['dml'] })
      log('[app] ' + t('Separar voz: rodando na placa de vídeo (DirectML)'))
      return s
    } catch {
      log('[app] ' + t('Separar voz: a placa não aceitou; rodando no processador (mais lento)'))
      return ort.InferenceSession.create(model, { executionProviders: ['cpu'] })
    }
  })()
  session.catch(() => (session = null))
  return session
}

function writeWav(file: string, L: Float32Array, R: Float32Array): void {
  const n = L.length
  const fd = openSync(file, 'w')
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + n * 8, 4)
  head.write('WAVE', 8)
  head.write('fmt ', 12)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(3, 20) // ponto flutuante
  head.writeUInt16LE(2, 22)
  head.writeUInt32LE(RATE, 24)
  head.writeUInt32LE(RATE * 8, 28)
  head.writeUInt16LE(8, 32)
  head.writeUInt16LE(32, 34)
  head.write('data', 36)
  head.writeUInt32LE(n * 8, 40)
  writeSync(fd, head)
  const block = 65536
  const buf = Buffer.alloc(block * 8)
  for (let i = 0; i < n; i += block) {
    const m = Math.min(block, n - i)
    for (let k = 0; k < m; k++) {
      buf.writeFloatLE(L[i + k], k * 8)
      buf.writeFloatLE(R[i + k], k * 8 + 4)
    }
    writeSync(fd, buf, 0, m * 8)
  }
  closeSync(fd)
}

const done = new Map<string, { voice: string; music: string }>()

/**
 * Separa o trecho [start, start+dur] em dois WAV (voz e música), guardados na pasta temporária. O mesmo trecho não é
 * separado duas vezes (medir o tempo e preparar reaproveitam).
 */
export async function separateStems(
  input: string,
  start: number,
  dur: number,
  onProgress: (p: number) => void,
  isCanceled: () => boolean,
  log: (l: string) => void
): Promise<{ voice: string; music: string } | string> {
  const tools = getToolStatus()
  const model = tools.separator
  if (!model) return t('O modelo de separar voz e música ainda não foi baixado. Baixe em Configurações → IAs.')
  const ffmpeg = tools.ffmpeg.path
  if (!ffmpeg) return t('ffmpeg.exe não encontrado')
  const key = createHash('sha1').update(JSON.stringify([input, start.toFixed(3), dur.toFixed(3)])).digest('hex').slice(0, 16)
  const hit = done.get(key)
  if (hit && existsSync(hit.voice) && existsSync(hit.music)) return hit

  // Áudio do trecho em estéreo 44,1 kHz, números de ponto flutuante intercalados (L R L R…)
  const a = await capture(ffmpeg, ['-hide_banner', '-v', 'error', '-ss', start.toFixed(3), '-t', dur.toFixed(3), '-i', input, '-vn', '-ac', '2', '-ar', String(RATE), '-f', 'f32le', 'pipe:1'])
  if (a.code !== 0 || a.out.length < 8) return a.err.trim().split(/\r?\n/).slice(-2).join(' ') || t('O vídeo não tem áudio')
  const n = Math.floor(a.out.length / 8)
  const padEnd = GEN - (n % GEN)
  const total = TRIM + n + padEnd + TRIM
  const L = new Float32Array(total)
  const R = new Float32Array(total)
  for (let i = 0; i < n; i++) {
    L[TRIM + i] = a.out.readFloatLE(i * 8)
    R[TRIM + i] = a.out.readFloatLE(i * 8 + 4)
  }

  const s = await getSession(model, log)
  const voiceL = new Float32Array(n)
  const voiceR = new Float32Array(n)
  const spec = new Float32Array(4 * DIM_F * DIM_T)
  const neg = new Float32Array(spec.length)
  const wl = new Float64Array(CHUNK)
  const wr = new Float64Array(CHUNK)
  const wl2 = new Float64Array(CHUNK)
  const wr2 = new Float64Array(CHUNK)
  const chunks = Math.ceil((n + padEnd) / GEN)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ort = require('onnxruntime-node') as typeof Ort
  for (let c = 0; c < chunks; c++) {
    if (isCanceled()) return t('Cancelado')
    const i0 = c * GEN
    stft(L, R, i0, spec)
    // Como o UVR ("denoise"): roda com o sinal e com o sinal invertido e tira a média; o ruído do modelo se cancela
    for (let k = 0; k < spec.length; k++) neg[k] = -spec[k]
    const r1 = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', spec, [1, 4, DIM_F, DIM_T]) })
    const r2 = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', neg, [1, 4, DIM_F, DIM_T]) })
    istft(r1[s.outputNames[0]].data as Float32Array, wl, wr)
    istft(r2[s.outputNames[0]].data as Float32Array, wl2, wr2)
    for (let k = 0; k < GEN; k++) {
      const j = i0 + k
      if (j >= n) break
      voiceL[j] = ((wl[TRIM + k] - wl2[TRIM + k]) / 2) * COMPENSATE
      voiceR[j] = ((wr[TRIM + k] - wr2[TRIM + k]) / 2) * COMPENSATE
    }
    onProgress(((c + 1) / chunks) * 100)
  }
  // Música = original − voz
  const musicL = new Float32Array(n)
  const musicR = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    musicL[i] = L[TRIM + i] - voiceL[i]
    musicR[i] = R[TRIM + i] - voiceR[i]
  }
  const dir = join(app.getPath('temp'), 'ytdlp-gui-separar')
  mkdirSync(dir, { recursive: true })
  const out = { voice: join(dir, `${key}-voz.wav`), music: join(dir, `${key}-musica.wav`) }
  writeWav(out.voice, voiceL, voiceR)
  writeWav(out.music, musicL, musicR)
  done.set(key, out)
  return out
}

/** Junta voz e música com os volumes escolhidos (1 = como estava) num WAV só */
export function mixStems(stems: { voice: string; music: string }, voice: number, music: number): Promise<string | null> {
  const ffmpeg = getToolStatus().ffmpeg.path!
  const out = stems.voice.replace(/-voz\.wav$/, `-mix-${Math.round(voice * 100)}-${Math.round(music * 100)}.wav`)
  if (existsSync(out)) return Promise.resolve(out)
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-i', stems.voice, '-i', stems.music, '-filter_complex', `[0:a]volume=${voice.toFixed(3)}[v];[1:a]volume=${music.toFixed(3)}[m];[v][m]amix=inputs=2:normalize=0[a]`, '-map', '[a]', '-c:a', 'pcm_f32le', out], { windowsHide: true })
    child.on('error', () => resolve(null))
    child.on('close', (code) => resolve(code === 0 ? out : null))
  })
}
