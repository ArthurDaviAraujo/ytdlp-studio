import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bookmark, RotateCcw, Timer, Trash2, TriangleAlert, X } from 'lucide-react'
import type { Capabilities, EnhanceSettings, ExportSettings, FrameMethod, Framing, SavedPreset } from '../../../shared/types'
import { BASE_EXPORT, BUILTIN_PRESETS, isV4Model, modelVersionKey, splitModelId } from '../../../shared/presets'
import { chooseScale, enhanceCount, enhanceOf, neededScale, withAiSize } from '../../../shared/enhance'
import { Button, Field, InfoTip, MaxQualityButton, WithTip, Range, Segmented, Select, Spinner, TextInput, Toggle, cx } from './ui'
import EnhancePanel from './EnhancePanel'
import { duration, parseTime } from '../lib/format'
import { locale, t } from '../../../shared/i18n'

export const ENCODER_LABEL: Record<string, string> = {
  h264_amf: 'Placa AMD (h264_amf)',
  h264_nvenc: 'Placa NVIDIA (h264_nvenc)',
  h264_qsv: 'Intel Quick Sync (h264_qsv)',
  h264_mf: 'Windows Media Foundation (h264_mf)',
  libx264: 'Processador (libx264)',
  libopenh264: 'Processador (OpenH264)'
}

const MODEL_HINT: Record<string, string> = {
  'rife-v4.26': 'o mais novo',
  'rife-v4.25-heavy': 'mais detalhe, ~1,6x mais lento',
  'rife-v4.6': 'oficial, o mais testado',
  'rife-anime': 'desenhos e animação',
  'rife-UHD': 'antigo, para 4K',
  'rife-HD': 'antigo, para HD',
  rife: 'o primeiro modelo'
}

function modelLabel(id: string): string {
  const { engine, name } = splitModelId(id)
  const hint = t(MODEL_HINT[name] ?? (/-lite$/.test(name) ? 'leve' : /-heavy$/.test(name) ? 'pesado, mais lento' : /-large$/.test(name) ? 'versão maior' : ''))
  return `${name}${engine ? ` · ${engine}` : ''}${hint ? ` (${hint})` : ''}`
}

const GENERATIONS: { title: string; test: (major: number) => boolean }[] = [
  { title: 'Geração 4 (aceitam qualquer FPS)', test: (m) => m >= 4 },
  { title: 'Geração 3', test: (m) => m === 3 },
  { title: 'Geração 2', test: (m) => m === 2 },
  { title: 'Primeiros modelos', test: (m) => m < 2 }
]

const ASPECTS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'keep', label: 'Manter o original', w: 0, h: 0 },
  { id: '9:16', label: '9:16 vertical (1080×1920)', w: 1080, h: 1920 },
  { id: '4:5', label: '4:5 retrato (1080×1350)', w: 1080, h: 1350 },
  { id: '1:1', label: '1:1 quadrado (1080×1080)', w: 1080, h: 1080 },
  { id: '16:9', label: '16:9 deitado (1920×1080)', w: 1920, h: 1080 },
  { id: '16:9-4k', label: '16:9 em 4K (3840×2160)', w: 3840, h: 2160 },
  { id: '4:3', label: '4:3 (1440×1080)', w: 1440, h: 1080 },
  { id: '21:9', label: '21:9 cinema (2560×1080)', w: 2560, h: 1080 }
]

const FPS_CHOICES = [0, 24, 25, 30, 48, 50, 60, 90, 120]
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

export interface SourceInfo {
  width: number
  height: number
  fps: number | null
  duration: number | null
}

/** 75 → "1 min 15 s"; 3700 → "1 h 02 min" */
export function niceTime(sec: number): string {
  const s = Math.max(1, Math.round(sec))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min${s % 60 ? ` ${String(s % 60).padStart(2, '0')} s` : ''}`
  const h = Math.floor(m / 60)
  return `${h} h ${String(m % 60).padStart(2, '0')} min`
}

type FormTab = 'format' | 'image' | 'motion' | 'file'
const TAB_KEY = 'export-form-tab'

/** Resumo curto do que o preparo vai fazer: "1080×1920 · IA 2x · 60 fps · 3 ajustes" */
export function exportSummary(s: ExportSettings, source: SourceInfo | null): string[] {
  const e = enhanceOf(s)
  const sized = source ? withAiSize(s, source) : s
  const k = source && e.upscaler !== 'none' ? chooseScale(e, neededScale(source, sized)) : 0
  const W = sized.width || source?.width || 0
  const H = sized.height || source?.height || 0
  const parts: string[] = []
  if (W && H) parts.push(`${W}×${H}`)
  if (e.upscaler !== 'none') parts.push(`${e.upscaler === 'esrgan' ? 'Real-ESRGAN' : 'Real-CUGAN'}${k ? ` ${k}x` : ''}`)
  const fps = s.fps || source?.fps
  if (fps) parts.push(`${Math.round(fps * 100) / 100} fps`)
  if (s.speed !== 1) parts.push(`${s.speed}x`)
  const c = enhanceCount(e)
  const others = c.image - (e.upscaler !== 'none' ? 1 : 0)
  if (others > 0) parts.push(t('{n} ajuste(s) de imagem', { n: others }))
  if (c.audio > 0 && s.audio) parts.push(t('som tratado'))
  return parts
}

function Sub({ title, info, children }: { title: string; info?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-3 border-t border-line pt-3">
      <div className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
        {title}
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      {children}
    </div>
  )
}

export default function ExportForm({
  value,
  onChange,
  caps,
  rifeModels,
  source,
  saved,
  onSavePreset,
  onDeletePreset,
  inputPath,
  upscalers = { esrgan: null, cugan: null },
  onEstimate
}: {
  value: ExportSettings
  onChange: (s: ExportSettings) => void
  caps: Capabilities | null
  rifeModels: string[]
  source: SourceInfo | null
  saved: SavedPreset[]
  onSavePreset: (s: ExportSettings) => void
  onDeletePreset: (id: string) => void
  /** Arquivo do vídeo, para medir quanto a exportação vai demorar */
  inputPath?: string | null
  /** Programas de ampliar com IA que existem nesta instalação */
  upscalers?: { esrgan: string | null; cugan: string | null }
  /** Avisa o tempo medido para estas opções (null = ainda não medido) */
  onEstimate?: (seconds: number | null) => void
}) {
  const [tab, setTab] = useState<FormTab>(() => {
    try {
      const v = localStorage.getItem(TAB_KEY) as FormTab | null
      return v && ['format', 'image', 'motion', 'file'].includes(v) ? v : 'format'
    } catch {
      return 'format'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab)
    } catch {
      // ignora
    }
  }, [tab])
  const enh = enhanceOf(value)
  const setEnh = (patch: Partial<EnhanceSettings>) => onChange({ ...value, enhance: { ...enh, ...patch } })
  const counts = enhanceCount(enh)
  // Valores de antes de ligar a Qualidade máxima, para desligar e voltar a eles
  const beforeBest = useRef<Pick<ExportSettings, 'quality' | 'encoder' | 'maxBitrate' | 'audio' | 'audioKbps'> | null>(null)
  const [naming, setNaming] = useState<string | null>(null)
  const set = <K extends keyof ExportSettings>(k: K, v: ExportSettings[K]) => onChange({ ...value, [k]: v })
  // Trocar de destino mantém o trecho escolhido
  const apply = (s: ExportSettings) => onChange({ ...s, start: value.start, end: value.end })

  const aspect = ASPECTS.find((a) => a.w === value.width && a.h === value.height)?.id ?? 'custom'
  const srcAR = source ? source.width / source.height : null
  const outW = value.width || source?.width || 0
  const outH = value.height || source?.height || 0
  const sameShape = srcAR != null && outW > 0 && Math.abs(srcAR - outW / outH) < 0.01
  const effFps = source?.fps ? source.fps * value.speed : null
  const target = value.fps || source?.fps || null
  const generates = effFps != null && target != null && target > effFps * 1.001
  const v4 = isV4Model(value.aiModel)

  const start = parseTime(value.start) ?? 0
  const end = parseTime(value.end) ?? source?.duration ?? null
  const outDur = end != null ? Math.max(0, end - start) / value.speed : null
  const tooLong = value.maxDuration > 0 && outDur != null && outDur > value.maxDuration + 0.5

  // Estimativa de tempo: mede o método escolhido num trecho curto e guarda o resultado por método
  const [measuring, setMeasuring] = useState(false)
  const [measured, setMeasured] = useState<{ base: string; full: string; label: string; seconds: number; ratio: number }[]>([])
  const [measureError, setMeasureError] = useState<string | null>(null)
  // Tudo o que muda o tempo, menos o método (para poder comparar os métodos entre si)
  const baseKey = JSON.stringify([inputPath, value.width, value.height, value.framing, value.zoom, value.fps, value.speed, value.start, value.end, value.encoder, value.quality, value.maxBitrate, value.audio, outDur?.toFixed(1)])
  const methodLabel = (m: FrameMethod) => (m === 'ai' ? `${t('IA (RIFE)')} · ${splitModelId(value.aiModel).name}${value.aiUhd ? ' UHD' : ''}${value.aiTtaSpatial || value.aiTtaTemporal ? ' TTA' : ''}` : m === 'gpu' ? t('Placa AMD') : m === 'cpu' ? t('Processador') : t('Duplicar'))
  const enhLabel = (() => {
    const parts: string[] = []
    if (enh.upscaler !== 'none') parts.push(enh.upscaler === 'esrgan' ? 'Real-ESRGAN' : 'Real-CUGAN')
    const others = counts.image - (enh.upscaler !== 'none' ? 1 : 0)
    if (others > 0) parts.push(t('+{n} ajuste(s)', { n: others }))
    return parts.length ? ' · ' + parts.join(' ') : ''
  })()
  const label = methodLabel(value.method) + enhLabel
  // Ver se a medição guardada é exatamente destas opções (a força de cada ajuste também muda o tempo)
  const full = JSON.stringify([value.method, value.aiModel, value.aiUhd, value.aiTtaSpatial, value.aiTtaTemporal, enh])
  const mine = measured.find((m) => m.base === baseKey && m.full === full)
  const sameBase = measured.filter((m) => m.base === baseKey).sort((a, b) => a.seconds - b.seconds)
  const mineSeconds = mine?.seconds ?? null
  useEffect(() => onEstimate?.(mineSeconds), [mineSeconds, onEstimate])

  // Abas, com um ponto nas que têm algo diferente do normal
  const tabs: { id: FormTab; label: string; title: string; changed: number }[] = [
    { id: 'format', label: t('Formato'), title: t('Tamanho e enquadramento'), changed: value.width || value.height ? 1 : 0 },
    { id: 'image', label: t('Imagem'), title: t('Ampliar com IA, limpeza, nitidez, cor e correções'), changed: counts.image },
    { id: 'motion', label: t('Movimento / FPS'), title: t('FPS, quadros novos, velocidade e trecho'), changed: value.fps || value.speed !== 1 || value.start || value.end ? 1 : 0 },
    { id: 'file', label: t('Arquivo'), title: t('Qualidade, codificador, nome e som'), changed: counts.audio }
  ]

  const measure = async () => {
    if (!inputPath || outDur == null || outDur <= 0) return
    setMeasuring(true)
    setMeasureError(null)
    const r = await window.api.estimateExport(inputPath, value, outDur)
    setMeasuring(false)
    if (r.canceled) return
    if (!r.ok) return setMeasureError(r.error)
    setMeasured((cur) => [...cur.filter((m) => !(m.base === baseKey && (m.full === full || m.label === label))), { base: baseKey, full, label, seconds: r.seconds, ratio: r.seconds / outDur }])
  }

  const methods: { value: FrameMethod; label: string; disabled?: boolean }[] = [
    { value: 'duplicate', label: t('Duplicar') },
    { value: 'gpu', label: t('Placa AMD'), disabled: !caps?.frcAmf },
    { value: 'cpu', label: t('Processador') },
    { value: 'ai', label: t('IA (RIFE)'), disabled: !rifeModels.length }
  ]
  const methodHint: Record<FrameMethod, string> = {
    duplicate: t('Repete quadros. Instantâneo, mas o movimento não fica mais suave.'),
    gpu: t('Interpolação da AMD (frc_amf) na sua placa. Rápida; dobra o FPS e completa o resto repetindo quadros.'),
    cpu: t('minterpolate do ffmpeg. Aceita qualquer FPS, mas é lento e pode distorcer movimentos rápidos.'),
    ai: t('RIFE. Roda na placa de vídeo (NVIDIA, AMD ou Intel). A melhor qualidade em movimento difícil; mais lento que a placa AMD.')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {BUILTIN_PRESETS.map((p) => (
          <button
            key={p.id}
            title={t(p.hint)}
            onClick={() => apply({ ...p.settings })}
            className={cx(
              'rounded-lg border px-2.5 py-1 text-xs',
              value.name === p.settings.name ? 'border-accent/60 bg-accent/12 text-text' : 'border-line bg-panel-2 text-muted hover:text-text'
            )}
          >
            {t(p.settings.name)}
          </button>
        ))}
        {saved.map((p) => (
          <span
            key={p.id}
            className={cx(
              'inline-flex items-center gap-1 rounded-lg border py-1 pr-1 pl-2.5 text-xs',
              value.name === p.settings.name ? 'border-accent/60 bg-accent/12 text-text' : 'border-line bg-panel-2 text-muted'
            )}
          >
            <button onClick={() => apply({ ...p.settings })} className="inline-flex items-center gap-1 hover:text-text">
              <Bookmark className="h-3 w-3" /> {p.settings.name}
            </button>
            <button title={t('Apagar predefinição')} onClick={() => onDeletePreset(p.id)} className="rounded p-0.5 hover:bg-panel-3 hover:text-err">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div role="tablist" className="sticky top-0 z-10 flex before:pointer-events-none before:absolute before:-inset-x-3 before:-top-4 before:h-4 before:bg-panel gap-0.5 rounded-lg border border-line bg-panel-2 p-0.5 shadow-[0_6px_12px_-6px_rgba(0,0,0,0.6)]">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            title={x.title}
            onClick={() => setTab(x.id)}
            className={cx(
              'relative flex h-8 flex-auto items-center justify-center gap-1 rounded-md px-2 text-[13px] whitespace-nowrap transition-colors',
              tab === x.id ? 'bg-panel-3 font-medium text-text shadow-sm ring-1 ring-line' : 'text-muted hover:text-text'
            )}
          >
            {x.label}
            {x.changed > 0 && <span className={cx('h-1.5 w-1.5 rounded-full', x.id === 'image' ? 'bg-warn' : 'bg-accent')} />}
          </button>
        ))}
      </div>

      {tab === 'format' && (
        <>
      <Sub title={t('Tamanho')}>
        <Select
          value={aspect}
          onChange={(e) => {
            const a = ASPECTS.find((x) => x.id === e.target.value)
            if (a) onChange({ ...value, width: a.w, height: a.h })
          }}
        >
          {ASPECTS.map((a) => (
            <option key={a.id} value={a.id}>
              {t(a.label)}
            </option>
          ))}
          {aspect === 'custom' && <option value="custom">{t('Personalizado')}</option>}
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Largura')}>
            <TextInput type="number" min={0} step={2} value={value.width} onChange={(e) => set('width', Math.max(0, Number(e.target.value) || 0))} />
          </Field>
          <Field label={t('Altura')}>
            <TextInput type="number" min={0} step={2} value={value.height} onChange={(e) => set('height', Math.max(0, Number(e.target.value) || 0))} />
          </Field>
        </div>
        <p className="text-xs text-faint">{t('0 = igual ao vídeo original')}{source ? ` (${source.width}×${source.height})` : ''}.</p>
      </Sub>

      {!sameShape && (
        <Sub title={t('Enquadramento')} info={t('Quando o formato final é diferente do vídeo (ex.: vídeo deitado para TikTok em pé). Cortar: corta as laterais e enche a tela. Fundo desfocado: o vídeo inteiro no meio, com ele mesmo ampliado e borrado atrás. Barras: o vídeo inteiro com faixas de cor em volta.')}>
          <Segmented<Framing>
            value={value.framing}
            onChange={(f) => set('framing', f)}
            options={[
              { value: 'crop', label: t('Cortar') },
              { value: 'blur', label: t('Fundo desfocado') },
              { value: 'bars', label: t('Barras') }
            ]}
          />
          {value.framing === 'crop' && (
            <>
              <Field label={<WithTip text={t('Zoom do corte: {zoom}x', { zoom: (value.zoom ?? 1).toFixed(1) })}>{t('Com zoom, o recorte pode ir para qualquer canto. Na prévia: arraste o quadro e use a rodinha do mouse.')}</WithTip>}>
                <input type="range" min={1} max={4} step={0.05} value={value.zoom ?? 1} onChange={(e) => set('zoom', Number(e.target.value))} className="w-full accent-[#ff4d4d]" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('Horizontal: {n}%', { n: value.position })}>
                  <input type="range" min={0} max={100} step={1} value={value.position} onChange={(e) => set('position', Number(e.target.value))} className="w-full accent-[#ff4d4d]" />
                </Field>
                <Field label={t('Vertical: {n}%', { n: value.positionY ?? 50 })}>
                  <input type="range" min={0} max={100} step={1} value={value.positionY ?? 50} onChange={(e) => set('positionY', Number(e.target.value))} className="w-full accent-[#ff4d4d]" />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onChange({ ...value, position: 50, positionY: 50 })}>
                  {t('Centralizar')}
                </Button>
                <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => onChange({ ...value, position: 50, positionY: 50, zoom: 1 })}>
                  {t('Resetar corte')}
                </Button>
              </div>
            </>
          )}
          {value.framing === 'blur' && (
            <Field label={t('Força do desfoque: {n}', { n: value.blur })}>
              <input type="range" min={2} max={60} step={1} value={value.blur} onChange={(e) => set('blur', Number(e.target.value))} className="w-full accent-[#ff4d4d]" />
            </Field>
          )}
          {value.framing === 'bars' && (
            <Field label={t('Cor das barras')}>
              <div className="flex items-center gap-2">
                <input type="color" value={value.barColor} onChange={(e) => set('barColor', e.target.value)} className="h-9 w-14 cursor-pointer rounded border border-line bg-panel-2" />
                <code className="text-xs text-muted">{value.barColor}</code>
              </div>
            </Field>
          )}
        </Sub>
      )}
        </>
      )}

      {tab === 'image' && <EnhancePanel value={value} onChange={onChange} caps={caps} upscalers={upscalers} source={source} />}

      {tab === 'motion' && (
        <>
      <Sub title={t('Quadros por segundo')}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={<WithTip text={t('FPS final')}>{t('Quadros por segundo: quantas imagens o vídeo mostra a cada segundo. 30 é o comum; 60 deixa o movimento mais liso. Subir o FPS só fica mais suave se criar quadros novos (abaixo).')}</WithTip>}>
            <Select value={FPS_CHOICES.includes(value.fps) ? value.fps : -1} onChange={(e) => Number(e.target.value) >= 0 && set('fps', Number(e.target.value))}>
              {FPS_CHOICES.map((f) => (
                <option key={f} value={f}>
                  {f === 0 ? t('Manter') + (source?.fps ? ` (${Math.round(source.fps * 100) / 100})` : '') : `${f} fps`}
                </option>
              ))}
              {!FPS_CHOICES.includes(value.fps) && <option value={-1}>{value.fps} fps</option>}
            </Select>
          </Field>
          <Field label={t('Outro valor')}>
            <TextInput type="number" min={0} max={240} step={1} value={value.fps || ''} placeholder={t('ex.: 144')} onChange={(e) => set('fps', Math.max(0, Math.min(240, Number(e.target.value) || 0)))} />
          </Field>
        </div>
        <Field label={<WithTip text={t('Quadros novos')}>{t('Como inventar as imagens que faltam quando o FPS sobe ou em câmera lenta.')}<br /><br />{t('Duplicar')}: {methodHint.duplicate}<br />{t('Placa AMD')}: {methodHint.gpu}<br />{t('Processador')}: {methodHint.cpu}<br />{t('IA (RIFE)')}: {methodHint.ai}</WithTip>}>
          <Segmented<FrameMethod> value={value.method} onChange={(m) => set('method', m)} options={methods} />
        </Field>
        {value.method === 'gpu' && !caps?.frcAmf && (
          <p className="text-xs text-warn">{t('Esta opção só existe em placas AMD. Com placa NVIDIA, use “IA (RIFE)”, que roda nela.')}</p>
        )}
        <p className={cx('text-xs', generates ? 'text-info' : 'text-faint')}>
          {effFps == null
            ? t('Só é usado quando o FPS final passa do FPS do vídeo ou em câmera lenta.')
            : generates
              ? t('Vai criar quadros: de {from} para {to} fps.', { from: Math.round(effFps * 100) / 100, to: target })
              : t('Com estas opções nenhum quadro novo é criado.')}
        </p>
        {value.method === 'ai' && rifeModels.length > 0 && (
          <div className="space-y-2 rounded-lg bg-panel-2 p-3">
            <Field label={<WithTip text={t('Placa de vídeo')}>{t('Num notebook com duas placas, escolha a NVIDIA ou AMD dedicada para ir mais rápido.')}</WithTip>}>
              <Select value={value.aiGpu ?? -1} onChange={(e) => set('aiGpu', Number(e.target.value))}>
                <option value={-1}>{t('Automática')}</option>
                {caps?.gpus.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={<WithTip text={t('Modelo de IA')}>{t('Versões do RIFE. Os mais novos (v4.x) costumam acertar melhor o movimento e aceitam qualquer FPS. “lite” é mais rápido, “heavy” e “large” buscam mais detalhe e são mais lentos.')}</WithTip>}>
              <Select value={rifeModels.includes(value.aiModel) ? value.aiModel : rifeModels[0]} onChange={(e) => set('aiModel', e.target.value)}>
                {GENERATIONS.map((g) => {
                  const list = rifeModels.filter((m) => g.test(modelVersionKey(m)[0]))
                  return list.length ? (
                    <optgroup key={g.title} label={t(g.title)}>
                      {list.map((m) => (
                        <option key={m} value={m}>
                          {modelLabel(m)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null
                })}
              </Select>
            </Field>
            <p className="text-xs text-faint">{rifeModels.length}{t(' modelos. “lite” é mais leve, “heavy” e “large” buscam mais detalhe.')}</p>
            {!v4 && <p className="text-xs text-warn">{t('Este modelo só dobra o FPS; o resto é completado repetindo quadros. Os modelos v4 aceitam qualquer FPS.')}</p>}
            <Toggle checked={value.aiUhd} onChange={(v) => set('aiUhd', v)} label={<WithTip text={t('Modo UHD')}>{t('Melhor para vídeos 4K com movimento grande.')}</WithTip>} />
            <Toggle checked={value.aiTtaSpatial} onChange={(v) => set('aiTtaSpatial', v)} label={<WithTip text={t('Qualidade extra espacial (TTA-s)')}>{t('A IA calcula cada quadro também espelhado e junta os resultados: menos defeitos nas bordas, mas bem mais lento.')}</WithTip>} />
            <Toggle checked={value.aiTtaTemporal} onChange={(v) => set('aiTtaTemporal', v)} label={<WithTip text={t('Qualidade extra temporal (TTA-t)')}>{t('A IA calcula também na ordem inversa do tempo e junta: movimento mais estável, mas bem mais lento.')}</WithTip>} />
            {(() => {
              const [maj, min] = modelVersionKey(value.aiModel)
              return maj === 4 && min >= 25 ? (
                <p className="text-xs text-faint">{t('A partir do v4.25 a comunidade marca o TTA como obsoleto: ele ainda roda, mas muda pouco o resultado.')}</p>
              ) : null
            })()}
          </div>
        )}
      </Sub>

      <Sub title={t('Velocidade e trecho')}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Velocidade')}>
            <Select value={SPEEDS.includes(value.speed) ? value.speed : -1} onChange={(e) => Number(e.target.value) > 0 && set('speed', Number(e.target.value))}>
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s === 1 ? t('Normal (1x)') : s < 1 ? t('Câmera lenta {s}x', { s }) : t('Acelerado {s}x', { s })}
                </option>
              ))}
              {!SPEEDS.includes(value.speed) && <option value={-1}>{value.speed < 1 ? t('Câmera lenta {s}x', { s: value.speed }) : t('Acelerado {s}x', { s: value.speed })}</option>}
            </Select>
          </Field>
          <Field label={t('Outro valor')}>
            <TextInput
              type="number"
              min={0.1}
              max={16}
              step={0.05}
              value={value.speed}
              placeholder={t('ex.: 1.37')}
              onChange={(e) => Number(e.target.value) > 0 && set('speed', Math.min(16, Math.max(0.1, Math.round(Number(e.target.value) * 100) / 100)))}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Início')}>
            <TextInput value={value.start} placeholder="0:00" onChange={(e) => set('start', e.target.value)} />
          </Field>
          <Field label={t('Fim')}>
            <TextInput value={value.end} placeholder={source?.duration ? duration(source.duration) : t('até o fim')} onChange={(e) => set('end', e.target.value)} />
          </Field>
        </div>
        {outDur != null && <p className="text-xs text-faint">{t('Duração final: ')}{duration(outDur)}</p>}
        {tooLong && (
          <div className="flex gap-2 rounded-lg bg-warn/10 p-2.5 text-xs text-warn">
            <TriangleAlert className="h-4 w-4 shrink-0" /> {t(value.name)}{t(' aceita até ')}{duration(value.maxDuration)}{t('. Defina início e fim.')}
          </div>
        )}
        <Field label={<WithTip text={t('Limite de duração para avisar (segundos, 0 = sem limite)')}>{t('Não corta nada: só mostra um aviso se o vídeo final passar desse tempo (ex.: Reels aceita até 3 min).')}</WithTip>}>
          <TextInput type="number" min={0} value={value.maxDuration} onChange={(e) => set('maxDuration', Math.max(0, Number(e.target.value) || 0))} />
        </Field>
      </Sub>
        </>
      )}

      {tab === 'file' && (
        <>
      <Sub title={t('Qualidade e arquivo')}>
        {(() => {
          // Qualidade máxima: imagem em 15 (sem perda visível), o codificador que mais preserva detalhe, sem teto de taxa e áudio no máximo
          const best = { quality: 15, encoder: 'libx264', maxBitrate: 0, audio: true, audioKbps: 320 }
          const isBest = value.quality <= best.quality && value.encoder === best.encoder && value.maxBitrate === 0 && value.audio && value.audioKbps === best.audioKbps
          const toggle = () => {
            if (!isBest) {
              beforeBest.current = { quality: value.quality, encoder: value.encoder, maxBitrate: value.maxBitrate, audio: value.audio, audioKbps: value.audioKbps }
              return onChange({ ...value, ...best })
            }
            // Desligar: volta ao que estava antes; sem isso, ao padrão
            const { quality, encoder, maxBitrate, audio, audioKbps } = BASE_EXPORT
            onChange({ ...value, ...(beforeBest.current ?? { quality, encoder, maxBitrate, audio, audioKbps }) })
            beforeBest.current = null
          }
          return (
            <MaxQualityButton
              active={isBest}
              onClick={toggle}
              detail={t('Imagem em 15, libx264, sem limite de taxa e áudio AAC 320 kbps. Tamanho, enquadramento e FPS não mudam.')}
              warning={t('Pode aumentar drasticamente o tamanho do arquivo e o tempo de preparo.')}
            />
          )
        })()}
        <Field label={<WithTip text={t('Qualidade: {n} (menor = melhor, arquivo maior)', { n: value.quality })}>{t('Quanto o vídeo é comprimido. 18 a 20 já parece igual ao original; 15 é quase sem perda; acima de 26 começa a aparecer borrão e quadradinhos. Cada 6 pontos a menos dobra o tamanho do arquivo, mais ou menos.')}</WithTip>}>
          <input type="range" min={14} max={32} step={1} value={value.quality} onChange={(e) => set('quality', Number(e.target.value))} className="w-full accent-[#ff4d4d]" />
        </Field>
        <Field label={<WithTip text={t('Codificador')}>{t('Quem grava o vídeo. Placa de vídeo (AMD, NVIDIA, Intel): muito mais rápido. Processador (libx264): mais lento, mas guarda mais detalhe no mesmo tamanho de arquivo.')}</WithTip>}>
          <Select value={value.encoder} onChange={(e) => set('encoder', e.target.value)}>
            <option value="">{t('Automático')}{caps?.encoders[0] ? ` (${t(ENCODER_LABEL[caps.encoders[0]] ?? caps.encoders[0])})` : ''}</option>
            {caps?.encoders.map((e) => (
              <option key={e} value={e}>
                {t(ENCODER_LABEL[e] ?? e)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={<WithTip text={t('Limite de taxa de bits (kbps, 0 = sem limite)')}>{t('Teto de dados por segundo. Deixe 0, a não ser que a rede ou o site exija um arquivo menor: com limite, cenas com muito movimento perdem qualidade.')}</WithTip>}>
          <TextInput type="number" min={0} step={500} value={value.maxBitrate} onChange={(e) => set('maxBitrate', Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        <Field label={t('Final do nome do arquivo')}>
          <TextInput value={value.suffix} onChange={(e) => set('suffix', e.target.value.replace(/[\\/:*?"<>|]/g, ''))} className="font-mono text-xs" />
        </Field>
      </Sub>

      <Sub title={t('Som')}>
        <Toggle checked={value.audio} onChange={(v) => set('audio', v)} label={t('Manter o áudio')} hint={t('Desligado: vídeo mudo, para pôr música no próprio app da rede.')} />
        {value.audio && (
          <>
            <Field label={<WithTip text={t('Qualidade do áudio')}>{t('kbps é a quantidade de dados do som por segundo. 128 serve para voz; 192 é bom para música; 256 e 320 quase ninguém nota diferença no celular.')}</WithTip>}>
              <Select value={value.audioKbps} onChange={(e) => set('audioKbps', Number(e.target.value))}>
                {[96, 128, 160, 192, 256, 320].map((k) => (
                  <option key={k} value={k}>
                    {t('AAC ')}{k} kbps
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={<WithTip text={t('Volume')}>{t('Padrão das redes: deixa o volume igual ao que TikTok, Reels e YouTube esperam, sem ficar baixo nem estourar. A outra opção também sobe as partes baixas, bom para conversa.')}</WithTip>}>
              <Select value={enh.audioLevel} onChange={(e) => setEnh({ audioLevel: e.target.value as EnhanceSettings['audioLevel'] })}>
                <option value="off">{t('Como está no vídeo')}</option>
                <option value="normalize">{t('Padrão das redes (−14 LUFS)')}</option>
                <option value="even">{t('Padrão das redes e partes baixas mais altas')}</option>
              </Select>
            </Field>
            <Range label={t('Tirar chiado e ruído de fundo')} value={enh.audioDenoise} min={0} max={10} onChange={(v) => setEnh({ audioDenoise: v })} format={(v) => (v ? String(v) : t('não'))} info={t('Tira o chiado constante de fundo (vento fraco, ventilador, ruído do microfone). Forte demais deixa a voz com som de “lata”.')} />
            <Toggle checked={enh.audioCut} onChange={(v) => setEnh({ audioCut: v })} label={<WithTip text={t('Cortar ronco e vento')}>{t('Tira os graves abaixo de 80 Hz, onde ficam o vento e o ronco do motor ou do ar-condicionado.')}</WithTip>} />
          </>
        )}
      </Sub>
        </>
      )}

      {inputPath && outDur != null && outDur > 0 && (
        <div className="space-y-1.5 rounded-lg border border-line bg-panel-2 p-2.5 text-xs">
          <div className="flex items-center gap-2">
            <Button size="sm" icon={measuring ? <Spinner className="h-3.5 w-3.5" /> : <Timer className="h-3.5 w-3.5" />} onClick={measuring ? () => void window.api.cancelEstimate() : measure}>
              {measuring ? t('Medindo… (clique para cancelar)') : mine ? t('Medir de novo') : t('Estimar o tempo')}
            </Button>
            {mine && !measuring && (
              <span className="text-sm">
                <span className="font-semibold text-text">≈ {niceTime(mine.seconds)}</span> <span className="text-muted">· {t('{n}x a duração do vídeo', { n: mine.ratio < 10 ? mine.ratio.toLocaleString(locale(), { maximumFractionDigits: 1 }) : Math.round(mine.ratio) })}</span>
              </span>
            )}
          </div>
          {!mine && !measuring && !measureError && <p className="text-faint">{t('Prepara dois trechos curtos do seu vídeo (1 e 3 s) com tudo o que está escolhido e calcula o tempo para o resto, nesta máquina.')}</p>}
          {measureError && <p className="text-err">{measureError}</p>}
          {sameBase.length > 1 && (
            <div className="space-y-0.5 pt-0.5">
              <div className="text-faint">{t('Comparando neste vídeo:')}</div>
              {sameBase.map((m) => (
                <div key={m.label} className={cx('flex justify-between gap-2', m.label === label ? 'text-text' : 'text-muted')}>
                  <span className="truncate">{m.label}</span>
                  <span className="font-mono tabular-nums">{niceTime(m.seconds)}</span>
                </div>
              ))}
            </div>
          )}
          {mine && <p className="text-faint">{t('É uma estimativa: pode mudar se o PC estiver ocupado com outras coisas.')}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {naming == null ? (
          <Button size="sm" icon={<Bookmark className="h-3.5 w-3.5" />} onClick={() => setNaming(value.name === 'Personalizado' ? '' : t('{name} (meu)', { name: t(value.name) }))}>
            {t('Salvar como predefinição')}
          </Button>
        ) : (
          <>
            <TextInput autoFocus value={naming} placeholder={t('Nome, ex.: Meu TikTok 60 fps')} onChange={(e) => setNaming(e.target.value)} className="h-7 flex-1 text-xs" />
            <Button
              size="sm"
              variant="primary"
              disabled={!naming.trim()}
              onClick={() => {
                onSavePreset({ ...value, name: naming.trim(), start: '', end: '' })
                onChange({ ...value, name: naming.trim() })
                setNaming(null)
              }}
            >
              {t('Salvar')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNaming(null)}>
              {t('Cancelar')}
            </Button>
          </>
        )}
        {(() => {
          const builtin = BUILTIN_PRESETS.find((p) => p.settings.name === value.name)?.settings ?? saved.find((p) => p.settings.name === value.name)?.settings
          return builtin ? (
            <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => apply({ ...builtin })}>
              {t('Restaurar')}
            </Button>
          ) : null
        })()}
        {saved.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-faint">
            <Trash2 className="h-3 w-3" />{t(' apague no x da predefinição')}
          </span>
        )}
      </div>
    </div>
  )
}
