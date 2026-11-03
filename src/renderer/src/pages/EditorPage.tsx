import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clapperboard, Crosshair, FileVideo, Gauge, FolderOpen, Music, Pause, Play, Plus, Redo2, RotateCcw, Scissors, SlidersVertical, Trash2, Undo2, Undo, Volume2, Wand2, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { EditPlan, EqSettings, Job, MediaInfo, MusicClip } from '../../../shared/types'
import { EQ_FLAT, EQ_FREQ, MID_Q, clipFilePos, clipSpan, dbToGain, eqIsFlat } from '../../../shared/audio'
import type { AppContext } from '../App'
import { Button, Card, Empty, ProgressBar, Spinner, Toggle, cx } from '../components/ui'
import Timeline, { clock, type Piece } from '../components/Timeline'
import type { EditorToMixer, MixerState, MixerToEditor } from '../components/Mixer'
import { fileUrl } from '../components/FramingPreview'
import { duration } from '../lib/format'
import { getLang, t } from '../../../shared/i18n'

const VIDEO_EXT = /\.(mp4|mkv|webm|mov|avi|m4v|ts|flv|wmv)$/i
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p
const THUMBS = 24
const PEAKS = 3000
const MIN_PIECE = 0.1
const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'wma', 'webm']
const MUSIC_VOLUME = 0.6
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

/** Tempo no vídeo final (só contando os trechos que ficam) para um ponto do original */
function outTime(pieces: Piece[], sec: number): number {
  let acc = 0
  for (const p of pieces) {
    if (p.removed) continue
    if (sec >= p.end) acc += p.end - p.start
    else {
      if (sec > p.start) acc += sec - p.start
      break
    }
  }
  return acc
}

/** Tudo o que o desfazer/refazer guarda */
interface Snap {
  pieces: Piece[]
  musics: MusicClip[]
  videoVolume: number
  videoEq: EqSettings
  speed: number
}

interface Props {
  ctx: AppContext
  jobs: Job[]
  active: boolean
  source: string | null
  setSource: (p: string | null) => void
}

export default function EditorPage({ ctx, jobs, active, source, setSource }: Props) {
  const [info, setInfo] = useState<MediaInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pieces, setPieces] = useState<Piece[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [thumbs, setThumbs] = useState<{ time: number; src: string | null }[]>([])
  const [peaks, setPeaks] = useState<number[]>([])
  const [failed, setFailed] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [musics, setMusics] = useState<MusicClip[]>([])
  const [musicPeaks, setMusicPeaks] = useState<Record<string, number[]>>({})
  const [videoVolume, setVideoVolume] = useState(1)
  const [videoEq, setVideoEq] = useState<EqSettings>(EQ_FLAT)
  const [mixerOpen, setMixerOpen] = useState(false)
  // Velocidade do vídeo (as músicas de fundo continuam na velocidade normal)
  const [speed, setSpeedState] = useState(1)
  const speedRef = useRef(speed)
  speedRef.current = speed
  // Prévia pelo Web Audio: ganho até 200% e medidores de nível no mixer
  const audioCtx = useRef<AudioContext | null>(null)
  const chains = useRef(new WeakMap<HTMLMediaElement, { gain: GainNode; bass: BiquadFilterNode; mid: BiquadFilterNode; treble: BiquadFilterNode; meter: AnalyserNode }>())
  const [meters, setMeters] = useState<Record<string, AnalyserNode | null>>({})
  const video = useRef<HTMLVideoElement>(null)
  // Um <audio> por música, para tocar todas juntas na prévia
  const audios = useRef(new Map<string, HTMLAudioElement>())
  const musicsRef = useRef(musics)
  musicsRef.current = musics
  const piecesRef = useRef(pieces)
  piecesRef.current = pieces

  const total = info?.duration ?? 0

  // Abre o vídeo: lê as informações, começa com um trecho só e busca miniaturas e onda em paralelo
  useEffect(() => {
    setInfo(null)
    setError(null)
    setThumbs([])
    setPeaks([])
    setFailed(false)
    setJobId(null)
    setSelected(null)
    setNow(0)
    setZoom(1)
    setMusics([])
    setMusicPeaks({})
    setVideoVolume(1)
    setVideoEq(EQ_FLAT)
    setSpeedState(1)
    if (!source) return
    let alive = true
    setLoading(true)
    void window.api.probeMedia(source).then((r) => {
      if (!alive) return
      setLoading(false)
      if (!r.ok || !r.info) return setError(r.error)
      const inf = r.info
      setInfo(inf)
      setPieces([{ start: 0, end: inf.duration, removed: false }])
      resetHistory()
      // Cada miniatura aparece assim que fica pronta (4 por vez), em vez de esperar todas
      const times = Array.from({ length: THUMBS }, (_, i) => ((i + 0.5) * inf.duration) / THUMBS)
      setThumbs(times.map((time) => ({ time, src: null })))
      let next = 0
      const worker = async () => {
        while (alive && next < times.length) {
          const i = next++
          const [src] = await window.api.mediaThumbs(source, [times[i]], 160)
          if (alive) setThumbs((cur) => cur.map((th, j) => (j === i ? { ...th, src } : th)))
        }
      }
      for (let k = 0; k < 4; k++) void worker()
      if (inf.hasAudio) void window.api.mediaPeaks(source, PEAKS).then((p) => alive && setPeaks(p))
    })
    return () => {
      alive = false
    }
  }, [source])

  // Sai da aba: pausa o vídeo
  useEffect(() => {
    if (!active) video.current?.pause()
  }, [active])

  // Cada música toca no tempo do vídeo final: começa em `at` e dura o que o clipe ocupa
  const syncMusic = (force = false) => {
    const v = video.current
    if (!v) return
    const list = piecesRef.current
    // Tempo no vídeo final, já na velocidade escolhida
    const out = outTime(list, v.currentTime) / speedRef.current
    const outTotal = list.reduce((acc, p) => acc + (p.removed ? 0 : p.end - p.start), 0) / speedRef.current
    for (const c of musicsRef.current) {
      const a = audios.current.get(c.id)
      if (!a) continue
      const t = out - c.at
      const p = !v.paused && t >= 0 && t < clipSpan(c, outTotal) ? clipFilePos(c, t) : null
      if (p == null) {
        if (!a.paused) a.pause()
        continue
      }
      if (force || Math.abs(a.currentTime - p) > 0.25) a.currentTime = p
      if (a.paused) {
        routeAll()
        void a.play()
      }
    }
  }

  /** Passa o som do elemento por um ganho e um medidor. Só dá para fazer uma vez por elemento; se falhar, fica o volume normal. */
  const route = (el: HTMLMediaElement | null) => {
    if (!el) return null
    const known = chains.current.get(el)
    if (known) return known
    try {
      audioCtx.current ??= new AudioContext()
      const ac = audioCtx.current
      // Mesmo caminho do arquivo final: ganho/volume → grave → médio → agudo → medidor
      const gain = ac.createGain()
      const bass = new BiquadFilterNode(ac, { type: 'lowshelf', frequency: EQ_FREQ.bass })
      const mid = new BiquadFilterNode(ac, { type: 'peaking', frequency: EQ_FREQ.mid, Q: MID_Q })
      const treble = new BiquadFilterNode(ac, { type: 'highshelf', frequency: EQ_FREQ.treble })
      const meter = ac.createAnalyser()
      meter.fftSize = 1024
      ac.createMediaElementSource(el).connect(gain).connect(bass).connect(mid).connect(treble).connect(meter).connect(ac.destination)
      const chain = { gain, bass, mid, treble, meter }
      chains.current.set(el, chain)
      el.volume = 1
      return chain
    } catch {
      return null
    }
  }
  const routeAll = () => {
    const next: Record<string, AnalyserNode | null> = { video: route(video.current)?.meter ?? null }
    for (const [id, el] of audios.current) next[id] = route(el)?.meter ?? null
    void audioCtx.current?.resume()
    setMeters((m) => (Object.keys(next).length === Object.keys(m).length && Object.entries(next).every(([k, v]) => m[k] === v) ? m : next))
  }

  // Volumes da prévia: pelo ganho do Web Audio vão até 200%; sem ele, o navegador para em 100%
  useEffect(() => {
    const v = video.current
    const cv = v ? chains.current.get(v) : undefined
    const apply = (c: typeof cv, vol: number, eq: EqSettings) => {
      if (!c) return
      c.gain.gain.value = vol * dbToGain(eq.gain)
      c.bass.gain.value = eq.bass
      c.mid.gain.value = eq.mid
      c.treble.gain.value = eq.treble
    }
    if (v) {
      if (cv) apply(cv, videoVolume, videoEq)
      else v.volume = Math.min(1, videoVolume)
    }
    for (const c of musics) {
      const el = audios.current.get(c.id)
      if (!el) continue
      const ca = chains.current.get(el)
      if (ca) apply(ca, c.volume, c.eq ?? EQ_FLAT)
      else el.volume = Math.min(1, c.volume)
    }
  }, [musics, info, videoVolume, videoEq, meters])

  // Onda de cada música para as trilhas da linha do tempo
  const pathsKey = [...new Set(musics.map((c) => c.path))].join('|')
  useEffect(() => {
    for (const p of new Set(musicsRef.current.map((c) => c.path))) {
      if (musicPeaks[p]) continue
      void window.api.mediaPeaks(p, 2000).then((pk) => setMusicPeaks((cur) => ({ ...cur, [p]: pk })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey])

  // Mixer numa janela própria: o editor guarda os valores, manda o estado e os níveis, e recebe o que a pessoa mexe
  const mixerChannels: MixerState['channels'] = [
    ...(info?.hasAudio ? [{ id: 'video', label: t('Vídeo'), value: videoVolume, eq: videoEq }] : []),
    ...musics.map((c, i) => ({ id: c.id, label: `${i + 1}. ${baseName(c.path).replace(/\.[^.]+$/, '')}`, value: c.volume, eq: c.eq ?? EQ_FLAT }))
  ]
  const mixerKey = JSON.stringify(mixerChannels)
  const mixerRef = useRef(mixerChannels)
  mixerRef.current = mixerChannels
  const sendMixer = (msg: EditorToMixer) => window.api.mixerPost(msg)

  useEffect(() => {
    if (mixerOpen) void window.api.mixerOpen({ width: Math.min(1160, 286 * Math.max(1, mixerRef.current.length)), height: 340 })
    else void window.api.mixerClose()
  }, [mixerOpen, mixerChannels.length])

  useEffect(() => {
    if (mixerOpen) sendMixer({ type: 'state', state: { lang: getLang(), channels: mixerRef.current } })
  }, [mixerOpen, mixerKey])

  useEffect(
    () =>
      window.api.onMixerMessage((raw) => {
        const msg = raw as MixerToEditor | EditorToMixer
        if (msg.type === 'hello') sendMixer({ type: 'state', state: { lang: getLang(), channels: mixerRef.current } })
        else if (msg.type === 'closed') setMixerOpen(false)
        else if (msg.type === 'reset') resetAudio()
        else if (msg.type === 'set') {
          if (msg.id === 'video') setVideoVolume(msg.value)
          else setMusics((cs) => cs.map((c) => (c.id === msg.id ? { ...c, volume: msg.value } : c)))
        } else if (msg.type === 'eq') {
          if (msg.id === 'video') setVideoEq(msg.eq)
          else setMusics((cs) => cs.map((c) => (c.id === msg.id ? { ...c, eq: msg.eq } : c)))
        }
      }),
    []
  )

  // Medidores: pico do que está tocando, com descida suave, ~25 vezes por segundo
  useEffect(() => {
    if (!mixerOpen) return
    const list = Object.entries(meters)
    const bufs = new Map<string, Float32Array<ArrayBuffer>>()
    const shown: Record<string, number> = {}
    const timer = setInterval(() => {
      const levels: Record<string, number> = {}
      for (const [id, m] of list) {
        if (!m) continue
        let buf = bufs.get(id)
        if (!buf) bufs.set(id, (buf = new Float32Array(m.fftSize)))
        m.getFloatTimeDomainData(buf)
        let peak = 0
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]))
        shown[id] = peak > (shown[id] ?? 0) ? peak : (shown[id] ?? 0) * 0.86
        levels[id] = Math.min(1, shown[id])
      }
      sendMixer({ type: 'levels', levels })
    }, 40)
    return () => clearInterval(timer)
  }, [mixerOpen, meters])

  const resetAudio = () => {
    setVideoVolume(1)
    setVideoEq(EQ_FLAT)
    setMusics((cs) => cs.map((c) => ({ ...c, volume: MUSIC_VOLUME, eq: EQ_FLAT })))
  }

  const outTotalNow = () => piecesRef.current.reduce((acc, p) => acc + (p.removed ? 0 : p.end - p.start), 0) / speedRef.current
  /** Onde a agulha está, no tempo do vídeo final (a música entra ali) */
  const atNeedle = () => Math.min(outTime(piecesRef.current, video.current?.currentTime ?? now) / speedRef.current, Math.max(0, outTotalNow() - 0.3))

  /** Muda a velocidade; as músicas continuam presas ao mesmo ponto do vídeo (o início delas é no tempo final) */
  const setSpeed = (next: number) => {
    const v = Math.min(16, Math.max(0.1, Math.round(next * 100) / 100))
    const old = speedRef.current
    if (v === old) return
    setMusics((cs) => cs.map((c) => ({ ...c, at: (c.at * old) / v })))
    setSpeedState(v)
  }

  // Prévia na velocidade escolhida (o navegador mantém o tom do som)
  useEffect(() => {
    if (video.current) video.current.playbackRate = speed
  }, [speed, info, failed])

  const addMusic = async () => {
    const p = await window.api.pickFile(musics[musics.length - 1]?.path ?? '', t('Áudio'), AUDIO_EXT)
    if (!p) return
    const fileDuration = await window.api.audioDuration(p)
    setMusics((cs) => [...cs, { id: crypto.randomUUID(), path: p, fileDuration, at: atNeedle(), start: 0, length: null, volume: MUSIC_VOLUME, loop: false, fade: true }])
  }
  const changeMusicFile = async (id: string) => {
    const cur = musics.find((c) => c.id === id)
    const p = await window.api.pickFile(cur?.path ?? '', t('Áudio'), AUDIO_EXT)
    if (!p) return
    const fileDuration = await window.api.audioDuration(p)
    setMusics((cs) => cs.map((c) => (c.id === id ? { ...c, path: p, fileDuration, start: 0, length: null } : c)))
  }
  const setClip = (id: string, patch: Partial<MusicClip>) => setMusics((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const commit = (next: Piece[]) => setPieces(next)

  // Desfazer/refazer de tudo o que se faz no editor: cortes, músicas, volumes, equalizador e velocidade.
  // Cada mudança vira um passo quando "assenta" (meio segundo sem mexer): arrastar um controle conta uma vez só.
  const current = useRef<Snap>({ pieces, musics, videoVolume, videoEq, speed })
  current.current = { pieces, musics, videoVolume, videoEq, speed }
  const pastRef = useRef<Snap[]>([])
  const futureRef = useRef<Snap[]>([])
  const settled = useRef<Snap | null>(null)
  const pendingFrom = useRef<Snap | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoring = useRef(false)
  const [, bumpHistory] = useState(0)

  const flush = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = null
    if (pendingFrom.current) {
      pastRef.current = [...pastRef.current, pendingFrom.current].slice(-200)
      futureRef.current = []
      pendingFrom.current = null
      bumpHistory((n) => n + 1)
    }
    settled.current = current.current
  }
  function resetHistory() {
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = null
    pastRef.current = []
    futureRef.current = []
    settled.current = null
    pendingFrom.current = null
    bumpHistory((n) => n + 1)
  }

  useEffect(() => {
    if (!info) return
    if (restoring.current) {
      restoring.current = false
      settled.current = current.current
      return
    }
    if (!settled.current) {
      settled.current = current.current
      return
    }
    pendingFrom.current ??= settled.current
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(flush, 500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, musics, videoVolume, videoEq, speed])

  const applySnap = (s: Snap) => {
    restoring.current = true
    setPieces(s.pieces)
    setMusics(s.musics)
    setVideoVolume(s.videoVolume)
    setVideoEq(s.videoEq)
    setSpeedState(s.speed)
    setSelected(null)
  }
  const undo = () => {
    flush()
    const prev = pastRef.current[pastRef.current.length - 1]
    if (!prev) return
    pastRef.current = pastRef.current.slice(0, -1)
    futureRef.current = [current.current, ...futureRef.current]
    applySnap(prev)
    bumpHistory((n) => n + 1)
  }
  const redo = () => {
    flush()
    const next = futureRef.current[0]
    if (!next) return
    futureRef.current = futureRef.current.slice(1)
    pastRef.current = [...pastRef.current, current.current]
    applySnap(next)
    bumpHistory((n) => n + 1)
  }

  const pieceAt = (sec: number) => pieces.findIndex((p) => sec >= p.start && sec < p.end)

  const seek = useCallback((sec: number) => {
    const v = video.current
    if (v) v.currentTime = sec
    setNow(sec)
  }, [])

  const split = () => {
    const i = pieces.findIndex((p) => now > p.start + MIN_PIECE && now < p.end - MIN_PIECE)
    if (i < 0) return
    const p = pieces[i]
    commit([...pieces.slice(0, i), { ...p, end: now }, { ...p, start: now }, ...pieces.slice(i + 1)])
    setSelected(i + 1)
  }

  const toggle = (i: number | null = selected ?? pieceAt(now)) => {
    if (i == null || i < 0 || !pieces[i]) return
    commit(pieces.map((p, j) => (j === i ? { ...p, removed: !p.removed } : p)))
  }

  const reset = () => {
    if (!info) return
    commit([{ start: 0, end: info.duration, removed: false }])
    setSelected(null)
  }

  const moveBoundary = (i: number, sec: number) => {
    setPieces((cur) => {
      const a = cur[i]
      const b = cur[i + 1]
      if (!a || !b) return cur
      const at = Math.min(b.end - MIN_PIECE, Math.max(a.start + MIN_PIECE, sec))
      return cur.map((p, j) => (j === i ? { ...p, end: at } : j === i + 1 ? { ...p, start: at } : p))
    })
  }

  // Tocar pula os trechos removidos, como vai ficar no arquivo final
  // setInterval em vez de requestAnimationFrame: este para quando a janela fica coberta, e a música deixaria de entrar
  useEffect(() => {
    if (!playing) return
    const loop = () => {
      const v = video.current
      if (!v) return
      const cur = v.currentTime
      const list = piecesRef.current
      const i = list.findIndex((p) => cur >= p.start && cur < p.end)
      if (i >= 0 && list[i].removed) {
        const next = list.slice(i + 1).find((p) => !p.removed)
        if (next) {
          v.currentTime = next.start
          syncMusic(true)
        } else {
          v.pause()
          v.currentTime = list[i].start
        }
      } else syncMusic()
      setNow(v.currentTime)
    }
    const timer = setInterval(loop, 30)
    return () => {
      clearInterval(timer)
      for (const a of audios.current.values()) a.pause()
    }
  }, [playing])

  const playPause = () => {
    const v = video.current
    if (!v || failed) return
    if (v.paused) {
      // Do fim ou de dentro de um trecho removido, começa no próximo trecho que fica
      const kept = pieces.filter((p) => !p.removed)
      if (!kept.length) return
      const i = pieceAt(v.currentTime)
      if (i < 0 || v.currentTime >= total - 0.05) v.currentTime = kept[0].start
      else if (pieces[i].removed) v.currentTime = (pieces.slice(i + 1).find((p) => !p.removed) ?? kept[0]).start
      routeAll()
      void v.play()
    } else v.pause()
  }

  // Atalhos de teclado (só com a aba aberta e fora de campos de texto)
  useEffect(() => {
    if (!active || !info) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) return
      const k = e.key.toLowerCase()
      if (e.ctrlKey && k === 'z' && !e.shiftKey) undo()
      else if (e.ctrlKey && (k === 'y' || (k === 'z' && e.shiftKey))) redo()
      else if (e.ctrlKey) return
      else if (k === ' ') playPause()
      else if (k === 's') split()
      else if (k === 'delete' || k === 'backspace') toggle()
      else if (k === 'arrowleft') seek(Math.max(0, now - (e.shiftKey ? 5 : 1)))
      else if (k === 'arrowright') seek(Math.min(total, now + (e.shiftKey ? 5 : 1)))
      else if (k === 'home') seek(0)
      else if (k === 'end') seek(total)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const kept = pieces.filter((p) => !p.removed)
  const keptDur = kept.reduce((acc, p) => acc + (p.end - p.start), 0)
  // Duração do vídeo final, na velocidade escolhida
  const finalDur = keptDur / speed
  const edited = pieces.length > 1 || pieces.some((p) => p.removed)
  const changed = edited || musics.length > 0 || videoVolume !== 1 || !eqIsFlat(videoEq) || speed !== 1
  const plan: EditPlan = { segments: edited ? kept.map(({ start, end }) => ({ start, end })) : [], musics, videoVolume, videoEq, speed }

  const recent = useMemo(() => {
    const files: string[] = []
    for (const j of [...jobs].sort((a, b) => b.createdAt - a.createdAt)) {
      if (j.status !== 'done') continue
      for (const f of j.files) if (VIDEO_EXT.test(f) && !files.includes(f)) files.push(f)
    }
    return files.slice(0, 12)
  }, [jobs])

  const pick = async () => {
    const p = await window.api.pickVideo(source ?? ctx.settings.downloadDir)
    if (p) setSource(p)
  }

  const exportCuts = async () => {
    if (!source || !info || !kept.length) return
    const job = await window.api.addJob({
      kind: 'cut',
      url: '',
      title: baseName(source),
      thumbnail: null,
      label: t('Cortes · {n} trecho(s) · {dur}', { n: kept.length, dur: duration(finalDur) }) + (speed !== 1 ? ` · ${speed}x` : '') + (musics.length ? ' · ' + t('com música') : ''),
      args: [],
      convert: null,
      input: source,
      edit: plan
    })
    setJobId(job.id)
  }

  const job = jobId ? jobs.find((j) => j.id === jobId) : undefined
  const result = job?.status === 'done' ? job.files[0] : undefined

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <h1 className="text-xl font-semibold">{t('Editor')}</h1>
              <p className="text-sm text-muted">{t('Corte o vídeo em partes e apague o que não quer. O arquivo novo junta só o que ficou.')}</p>
            </div>
            <Button icon={<FolderOpen className="h-4 w-4" />} onClick={pick}>
              {t('Escolher vídeo do PC')}
            </Button>
          </div>

          {!source && (
            <Card title={t('Vídeos baixados recentemente')}>
              {recent.length ? (
                <div className="space-y-1">
                  {recent.map((f) => (
                    <button key={f} onClick={() => setSource(f)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel-2">
                      <FileVideo className="h-4 w-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{baseName(f)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <Empty icon={<Clapperboard className="h-8 w-8" />} title={t('Escolha um vídeo')}>
                  {t('Use “Escolher vídeo do PC” ou o botão Editar de um download concluído.')}
                </Empty>
              )}
            </Card>
          )}

          {source && (
            <Card
              title={baseName(source)}
              actions={
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => window.api.showInFolder(source)}>
                    {t('Mostrar na pasta')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSource(null)}>
                    {t('Trocar')}
                  </Button>
                </div>
              }
            >
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Spinner />{t(' Lendo o vídeo…')}
                </div>
              )}
              {error && <div className="text-sm text-err">{error}</div>}
              {info && (
                <div className="space-y-3">
                  <div className="relative overflow-hidden rounded-lg bg-black">
                    {!failed ? (
                      <video
                        ref={video}
                        src={fileUrl(source)}
                        preload="auto"
                        className="mx-auto max-h-[60vh] w-full object-contain"
                        style={{ aspectRatio: `${info.width} / ${info.height}` }}
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        onSeeked={(e) => !playing && setNow(e.currentTarget.currentTime)}
                        onError={() => setFailed(true)}
                        onClick={playPause}
                      />
                    ) : null}
                    {musics.map((c) => (
                      <audio
                        key={c.id}
                        ref={(el) => {
                          if (el) audios.current.set(c.id, el)
                          else audios.current.delete(c.id)
                        }}
                        src={fileUrl(c.path)}
                        preload="auto"
                      />
                    ))}
                    {failed && (
                      <div className="grid h-48 place-items-center px-6 text-center text-sm text-muted">{t('Este formato não toca na prévia; o resultado final não é afetado.')}</div>
                    )}
                    {pieces[pieceAt(now)]?.removed && (
                      <div className="pointer-events-none absolute top-3 left-3 rounded-md bg-black/75 px-2 py-1 text-xs text-warn">{t('Trecho removido')}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" icon={playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} onClick={playPause} disabled={failed} title={t('Tocar / pausar (Espaço)')}>
                      {playing ? t('Pausar') : t('Tocar')}
                    </Button>
                    <span className="min-w-[150px] font-mono text-xs text-muted tabular-nums">
                      <span className="text-text">{clock(now)}</span> / {clock(total)}
                    </span>
                    <div className="mx-1 h-6 w-px bg-line" />
                    <Button icon={<Scissors className="h-4 w-4" />} onClick={split} title={t('Divide o trecho na posição da agulha (S)')}>
                      {t('Cortar aqui')}
                    </Button>
                    {(() => {
                      const i = selected ?? pieceAt(now)
                      const p = pieces[i]
                      return (
                        <Button
                          variant={p?.removed ? 'secondary' : 'danger'}
                          icon={p?.removed ? <Undo className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                          onClick={() => toggle(i)}
                          disabled={!p}
                          title={t('Apaga ou devolve o trecho selecionado (Delete)')}
                        >
                          {p?.removed ? t('Devolver trecho') : t('Apagar trecho')}
                        </Button>
                      )
                    })()}
                    <div className="mx-1 h-6 w-px bg-line" />
                    <Button variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={undo} disabled={!pastRef.current.length && !pendingFrom.current} title={t('Desfazer (Ctrl+Z)')} />
                    <Button variant="ghost" icon={<Redo2 className="h-4 w-4" />} onClick={redo} disabled={!futureRef.current.length} title={t('Refazer (Ctrl+Y)')} />
                    <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={reset} disabled={!edited}>
                      {t('Recomeçar')}
                    </Button>
                    <div className="flex items-center gap-1.5" title={t('Velocidade do vídeo. As músicas de fundo continuam na velocidade normal.')}>
                      <Gauge className="h-4 w-4 text-muted" />
                      <select
                        value={SPEEDS.includes(speed) ? speed : 'outro'}
                        onChange={(e) => e.target.value !== 'outro' && setSpeed(Number(e.target.value))}
                        className="h-9 rounded-lg border border-line bg-panel-2 px-2 text-sm"
                        aria-label={t('Velocidade')}
                      >
                        {SPEEDS.map((s) => (
                          <option key={s} value={s}>
                            {s}x
                          </option>
                        ))}
                        {!SPEEDS.includes(speed) && <option value="outro">{speed}x</option>}
                      </select>
                      <input
                        type="number"
                        min={0.1}
                        max={16}
                        step={0.05}
                        value={speed}
                        onChange={(e) => Number(e.target.value) > 0 && setSpeed(Number(e.target.value))}
                        className="h-9 w-20 rounded-lg border border-line bg-panel-2 px-2 text-sm tabular-nums"
                        aria-label={t('Outra velocidade')}
                      />
                    </div>
                    <Button variant={mixerOpen ? 'secondary' : 'ghost'} icon={<SlidersVertical className="h-4 w-4" />} onClick={() => setMixerOpen(!mixerOpen)} disabled={!info.hasAudio && !musics.length} title={t('Mesa de som por cima do vídeo, para ajustar os volumes enquanto toca')}>
                      {t('Mixer')}
                    </Button>
                    <div className="ml-auto flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" icon={<ZoomOut className="h-4 w-4" />} onClick={() => setZoom((z) => Math.max(1, z / 1.5))} disabled={zoom <= 1} title={t('Menos zoom')} />
                      <input type="range" min={0} max={6} step={0.05} value={Math.log(zoom) / Math.log(2)} onChange={(e) => setZoom(2 ** Number(e.target.value))} className="w-28 accent-[#ff4d4d]" aria-label={t('Zoom da linha do tempo')} />
                      <Button variant="ghost" size="sm" icon={<ZoomIn className="h-4 w-4" />} onClick={() => setZoom((z) => Math.min(64, z * 1.5))} disabled={zoom >= 64} title={t('Mais zoom')} />
                    </div>
                  </div>

                  <Timeline
                    total={total}
                    pieces={pieces}
                    selected={selected}
                    now={now}
                    zoom={zoom}
                    thumbs={thumbs}
                    peaks={peaks}
                    following={playing}
                    onSeek={seek}
                    onSelect={setSelected}
                    // O desfazer guarda o arraste sozinho quando ele assenta
                    onBoundaryStart={() => {}}
                    onBoundaryMove={moveBoundary}
                    musics={musics.map((c) => ({ id: c.id, name: baseName(c.path), peaks: musicPeaks[c.path] ?? [], fileDuration: c.fileDuration ?? 0, at: c.at, start: c.start, span: clipSpan(c, finalDur), loop: c.loop }))}
                    speed={speed}
                    onClipChange={setClip}
                  />
                  <p className="text-xs text-faint">
                    {t('Atalhos: Espaço toca/pausa · S corta · Delete apaga ou devolve · ←/→ anda 1 s (Shift = 5 s) · Ctrl+Z desfaz. Arraste as divisas brancas para ajustar um corte.')}
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <Scissors className="h-4 w-4 text-muted" />
          <h2 className="text-[15px] font-semibold">{t('Trechos')}</h2>
          {info && <span className="ml-auto text-xs text-muted">{t('{kept} de {total} ficam', { kept: kept.length, total: pieces.length })}</span>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-1.5 px-3 py-3">
          {!info && <p className="px-2 text-sm text-muted">{t('Abra um vídeo para começar.')}</p>}
          {info &&
            pieces.map((p, i) => (
              <div
                key={`${p.start}-${i}`}
                onClick={() => {
                  setSelected(i)
                  seek(p.start)
                }}
                className={cx(
                  'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm',
                  selected === i ? 'border-accent/60 bg-accent/10' : 'border-transparent hover:bg-panel-2',
                  p.removed && 'opacity-55'
                )}
              >
                <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-semibold', p.removed ? 'bg-panel-3 text-faint line-through' : 'bg-accent/15 text-accent')}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className={cx('font-mono text-xs tabular-nums', p.removed && 'line-through')}>
                    {clock(p.start)} – {clock(p.end)}
                  </div>
                  <div className="text-xs text-muted">{p.removed ? t('Apagado') : duration(p.end - p.start)}</div>
                </div>
                <button
                  className="rounded p-1 text-muted hover:bg-panel-3 hover:text-text"
                  title={p.removed ? t('Devolver trecho') : t('Apagar trecho')}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(i)
                  }}
                >
                  {p.removed ? <Undo className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            ))}
        </div>
        {info && (
          <div className="space-y-3 border-t border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-muted" />
              <span className="flex-1 text-sm font-semibold">{t('Áudio')}</span>
              <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-panel-3 hover:text-text" title={t('Volumes em 100% (músicas em 60%) e equalizadores zerados')} onClick={resetAudio}>
                <RotateCcw className="h-3 w-3" />
                {t('Restaurar áudio')}
              </button>
            </div>
            {info.hasAudio ? (
              <label className="block text-xs">
                <span className="flex items-center gap-1 text-muted">
                  <span className="flex-1">{t('Som do vídeo: {n}%', { n: Math.round(videoVolume * 100) })}</span>
                  <button className="rounded p-0.5 text-faint hover:bg-panel-3 hover:text-text" title={t('Voltar para 100%')} onClick={() => setVideoVolume(1)}>
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </span>
                <input type="range" min={0} max={2} step={0.05} value={videoVolume} onChange={(e) => setVideoVolume(Number(e.target.value))} className="w-full accent-[#ff4d4d]" />
              </label>
            ) : (
              <p className="text-xs text-muted">{t('O vídeo não tem som.')}</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <Music className="h-4 w-4 text-muted" />
              <span className="flex-1 text-sm font-semibold">{t('Músicas')}</span>
              <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={addMusic}>
                {t('Adicionar música')}
              </Button>
            </div>
            {!musics.length && <p className="text-xs text-faint">{t('A música entra onde está a agulha vermelha. Depois é só arrastar a trilha dela na linha do tempo.')}</p>}
            {musics.map((c, i) => (
              <div key={c.id} className="space-y-2 rounded-lg bg-panel-2 p-2.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-info/15 text-[10px] font-semibold text-info">{i + 1}</span>
                  <button className="min-w-0 flex-1 truncate text-left hover:underline" title={t('Trocar')} onClick={() => void changeMusicFile(c.id)}>
                    {baseName(c.path)}
                  </button>
                  {c.fileDuration != null && <span className="text-muted">{duration(c.fileDuration)}</span>}
                  <button className="rounded p-0.5 text-muted hover:bg-panel-3 hover:text-text" title={t('Tirar a música')} onClick={() => setMusics((cs) => cs.filter((x) => x.id !== c.id))}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-1 text-muted">
                  <span className="flex-1">{t('Começa no vídeo em {time}', { time: clock(c.at) })}</span>
                  <Button size="sm" variant="ghost" icon={<Crosshair className="h-3.5 w-3.5" />} onClick={() => setClip(c.id, { at: atNeedle() })} title={t('A música passa a começar onde está a agulha vermelha')}>
                    {t('Na agulha')}
                  </Button>
                </div>
                <input type="range" min={0} max={Math.max(0.1, finalDur - 0.3)} step={0.1} value={Math.min(c.at, finalDur)} onChange={(e) => setClip(c.id, { at: Number(e.target.value) })} className="w-full accent-[#ff4d4d]" aria-label={t('Começa no vídeo em {time}', { time: clock(c.at) })} />
                {c.fileDuration != null && c.fileDuration > 1 && (
                  <label className="block">
                    <span className="flex items-center gap-1 text-muted">
                      <span className="flex-1">{t('Começar a música em {time}', { time: duration(c.start) })}</span>
                      <button className="rounded p-0.5 text-faint hover:bg-panel-3 hover:text-text" title={t('Voltar para o começo')} onClick={() => setClip(c.id, { start: 0 })}>
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    </span>
                    <input type="range" min={0} max={Math.max(0, c.fileDuration - 1)} step={0.5} value={c.start} onChange={(e) => setClip(c.id, { start: Number(e.target.value) })} className="w-full accent-[#ff4d4d]" />
                  </label>
                )}
                <div className="flex items-center gap-1 text-muted">
                  <span className="flex-1">{t('Toca por {time}', { time: clock(clipSpan(c, finalDur)) })}</span>
                  {c.length != null && (
                    <button className="rounded px-1 py-0.5 text-faint hover:bg-panel-3 hover:text-text" onClick={() => setClip(c.id, { length: null })}>
                      {t('Até o fim')}
                    </button>
                  )}
                </div>
                <label className="block">
                  <span className="flex items-center gap-1 text-muted">
                    <span className="flex-1">{t('Volume da música: {n}%', { n: Math.round(c.volume * 100) })}</span>
                    <button className="rounded p-0.5 text-faint hover:bg-panel-3 hover:text-text" title={t('Voltar para 60%')} onClick={() => setClip(c.id, { volume: MUSIC_VOLUME })}>
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  </span>
                  <input type="range" min={0} max={2} step={0.05} value={c.volume} onChange={(e) => setClip(c.id, { volume: Number(e.target.value) })} className="w-full accent-[#ff4d4d]" />
                </label>
                <Toggle checked={c.loop} onChange={(v) => setClip(c.id, { loop: v, length: null })} label={t('Repetir se a música acabar antes')} />
                <Toggle checked={c.fade} onChange={(v) => setClip(c.id, { fade: v })} label={t('Suavizar o começo e o fim')} />
              </div>
            ))}
            {musics.length > 0 && <p className="text-xs text-faint">{t('Arraste o clipe na linha do tempo para mudar onde a música começa; arraste as pontas para cortar o começo ou o fim.')}</p>}
          </div>
        )}
        </div>
        <div className="space-y-3 border-t border-line p-4">
          {info && (
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">{t('Duração final')}</span>
              <span className="font-mono tabular-nums">
                {duration(finalDur)} <span className="text-faint">/ {duration(total)}</span>
              </span>
            </div>
          )}
          {job && (
            <div className="space-y-2 rounded-lg bg-panel-2 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{t(job.stage)}</span>
                {job.percent != null && job.status !== 'done' && <span className="text-muted">{Math.round(job.percent)}%</span>}
              </div>
              {(job.status === 'running' || job.status === 'queued' || job.status === 'converting') && <ProgressBar percent={job.percent} />}
              {job.error && <div className="text-err">{job.error}</div>}
              {result && (
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" onClick={() => window.api.openPath(result)}>
                    {t('Abrir')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => window.api.showInFolder(result)}>
                    {t('Mostrar na pasta')}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Wand2 className="h-3.5 w-3.5" />} onClick={() => ctx.openExport(result)}>
                    {t('Preparar para postar')}
                  </Button>
                </div>
              )}
            </div>
          )}
          <Button variant="primary" size="lg" className="w-full" icon={<Wand2 className="h-5 w-5" />} disabled={!info || !source || !kept.length} onClick={() => source && ctx.openExport(source, changed ? plan : null)}>
            {t('Preparar para postar')}
          </Button>
          <Button className="w-full" icon={<Scissors className="h-4 w-4" />} disabled={!info || !kept.length || !changed} onClick={exportCuts}>
            {t('Exportar só o vídeo editado')}
          </Button>
        </div>
      </aside>
    </div>
  )
}
