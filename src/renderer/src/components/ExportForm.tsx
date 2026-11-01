import { useState, type ReactNode } from 'react'
import { Bookmark, RotateCcw, Trash2, TriangleAlert, X } from 'lucide-react'
import type { Capabilities, ExportSettings, FrameMethod, Framing, SavedPreset } from '../../../shared/types'
import { BUILTIN_PRESETS, isV4Model, modelVersionKey, splitModelId } from '../../../shared/presets'
import { Button, Field, Segmented, Select, TextInput, Toggle, cx } from './ui'
import { duration, parseTime } from '../lib/format'

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
  const hint = MODEL_HINT[name] ?? (/-lite$/.test(name) ? 'leve' : /-heavy$/.test(name) ? 'pesado, mais lento' : /-large$/.test(name) ? 'versão maior' : '')
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

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5 border-t border-line pt-3">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{title}</div>
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
  onDeletePreset
}: {
  value: ExportSettings
  onChange: (s: ExportSettings) => void
  caps: Capabilities | null
  rifeModels: string[]
  source: SourceInfo | null
  saved: SavedPreset[]
  onSavePreset: (s: ExportSettings) => void
  onDeletePreset: (id: string) => void
}) {
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

  const methods: { value: FrameMethod; label: string; disabled?: boolean }[] = [
    { value: 'duplicate', label: 'Duplicar' },
    { value: 'gpu', label: 'Placa AMD', disabled: !caps?.frcAmf },
    { value: 'cpu', label: 'Processador' },
    { value: 'ai', label: 'IA (RIFE)', disabled: !rifeModels.length }
  ]
  const methodHint: Record<FrameMethod, string> = {
    duplicate: 'Repete quadros. Instantâneo, mas o movimento não fica mais suave.',
    gpu: 'Interpolação da AMD (frc_amf) na sua placa. Rápida; dobra o FPS e completa o resto repetindo quadros.',
    cpu: 'minterpolate do ffmpeg. Aceita qualquer FPS, mas é lento e pode distorcer movimentos rápidos.',
    ai: 'RIFE. Roda na placa de vídeo (NVIDIA, AMD ou Intel). A melhor qualidade em movimento difícil; mais lento que a placa AMD.'
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {BUILTIN_PRESETS.map((p) => (
          <button
            key={p.id}
            title={p.hint}
            onClick={() => apply({ ...p.settings })}
            className={cx(
              'rounded-lg border px-2.5 py-1 text-xs',
              value.name === p.settings.name ? 'border-accent/60 bg-accent/12 text-text' : 'border-line bg-panel-2 text-muted hover:text-text'
            )}
          >
            {p.settings.name}
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
            <button title="Apagar predefinição" onClick={() => onDeletePreset(p.id)} className="rounded p-0.5 hover:bg-panel-3 hover:text-err">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <Sub title="Tamanho">
        <Select
          value={aspect}
          onChange={(e) => {
            const a = ASPECTS.find((x) => x.id === e.target.value)
            if (a) onChange({ ...value, width: a.w, height: a.h })
          }}
        >
          {ASPECTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
          {aspect === 'custom' && <option value="custom">Personalizado</option>}
        </Select>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Largura">
            <TextInput type="number" min={0} step={2} value={value.width} onChange={(e) => set('width', Math.max(0, Number(e.target.value) || 0))} />
          </Field>
          <Field label="Altura">
            <TextInput type="number" min={0} step={2} value={value.height} onChange={(e) => set('height', Math.max(0, Number(e.target.value) || 0))} />
          </Field>
        </div>
        <p className="text-xs text-faint">0 = igual ao vídeo original{source ? ` (${source.width}×${source.height})` : ''}.</p>
      </Sub>

      {!sameShape && (
        <Sub title="Enquadramento">
          <Segmented<Framing>
            value={value.framing}
            onChange={(f) => set('framing', f)}
            options={[
              { value: 'crop', label: 'Cortar' },
              { value: 'blur', label: 'Fundo desfocado' },
              { value: 'bars', label: 'Barras' }
            ]}
          />
          {value.framing === 'crop' && (
            <>
              <Field label={`Zoom do corte: ${(value.zoom ?? 1).toFixed(1)}x`} hint="Com zoom, o recorte pode ir para qualquer canto. Na prévia: arraste o quadro e use a rodinha do mouse.">
                <input type="range" min={1} max={4} step={0.05} value={value.zoom ?? 1} onChange={(e) => set('zoom', Number(e.target.value))} className="w-full accent-[#ff4d4d]" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Horizontal: ${value.position}%`}>
                  <input type="range" min={0} max={100} step={1} value={value.position} onChange={(e) => set('position', Number(e.target.value))} className="w-full accent-[#ff4d4d]" />
                </Field>
                <Field label={`Vertical: ${value.positionY ?? 50}%`}>
                  <input type="range" min={0} max={100} step={1} value={value.positionY ?? 50} onChange={(e) => set('positionY', Number(e.target.value))} className="w-full accent-[#ff4d4d]" />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onChange({ ...value, position: 50, positionY: 50 })}>
                  Centralizar
                </Button>
                <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => onChange({ ...value, position: 50, positionY: 50, zoom: 1 })}>
                  Resetar corte
                </Button>
              </div>
            </>
          )}
          {value.framing === 'blur' && (
            <Field label={`Força do desfoque: ${value.blur}`}>
              <input type="range" min={2} max={60} step={1} value={value.blur} onChange={(e) => set('blur', Number(e.target.value))} className="w-full accent-[#ff4d4d]" />
            </Field>
          )}
          {value.framing === 'bars' && (
            <Field label="Cor das barras">
              <div className="flex items-center gap-2">
                <input type="color" value={value.barColor} onChange={(e) => set('barColor', e.target.value)} className="h-9 w-14 cursor-pointer rounded border border-line bg-panel-2" />
                <code className="text-xs text-muted">{value.barColor}</code>
              </div>
            </Field>
          )}
        </Sub>
      )}

      <Sub title="Quadros por segundo">
        <div className="grid grid-cols-2 gap-2">
          <Field label="FPS final">
            <Select value={FPS_CHOICES.includes(value.fps) ? value.fps : -1} onChange={(e) => Number(e.target.value) >= 0 && set('fps', Number(e.target.value))}>
              {FPS_CHOICES.map((f) => (
                <option key={f} value={f}>
                  {f === 0 ? `Manter${source?.fps ? ` (${Math.round(source.fps * 100) / 100})` : ''}` : `${f} fps`}
                </option>
              ))}
              {!FPS_CHOICES.includes(value.fps) && <option value={-1}>{value.fps} fps</option>}
            </Select>
          </Field>
          <Field label="Outro valor">
            <TextInput type="number" min={0} max={240} step={1} value={value.fps || ''} placeholder="ex.: 144" onChange={(e) => set('fps', Math.max(0, Math.min(240, Number(e.target.value) || 0)))} />
          </Field>
        </div>
        <Field label="Quadros novos">
          <Segmented<FrameMethod> value={value.method} onChange={(m) => set('method', m)} options={methods} />
        </Field>
        <p className="text-xs text-muted">{methodHint[value.method]}</p>
        {value.method === 'gpu' && !caps?.frcAmf && (
          <p className="text-xs text-warn">Esta opção só existe em placas AMD. Com placa NVIDIA, use “IA (RIFE)”, que roda nela.</p>
        )}
        <p className={cx('text-xs', generates ? 'text-info' : 'text-faint')}>
          {effFps == null
            ? 'Só é usado quando o FPS final passa do FPS do vídeo ou em câmera lenta.'
            : generates
              ? `Vai criar quadros: de ${Math.round(effFps * 100) / 100} para ${target} fps.`
              : 'Com estas opções nenhum quadro novo é criado.'}
        </p>
        {value.method === 'ai' && rifeModels.length > 0 && (
          <div className="space-y-2 rounded-lg bg-panel-2 p-3">
            <Field label="Placa de vídeo" hint="Num notebook com duas placas, escolha a NVIDIA ou AMD dedicada para ir mais rápido.">
              <Select value={value.aiGpu ?? -1} onChange={(e) => set('aiGpu', Number(e.target.value))}>
                <option value={-1}>Automática</option>
                {caps?.gpus.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Modelo de IA">
              <Select value={rifeModels.includes(value.aiModel) ? value.aiModel : rifeModels[0]} onChange={(e) => set('aiModel', e.target.value)}>
                {GENERATIONS.map((g) => {
                  const list = rifeModels.filter((m) => g.test(modelVersionKey(m)[0]))
                  return list.length ? (
                    <optgroup key={g.title} label={g.title}>
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
            <p className="text-xs text-faint">{rifeModels.length} modelos. “lite” é mais leve, “heavy” e “large” buscam mais detalhe.</p>
            {!v4 && <p className="text-xs text-warn">Este modelo só dobra o FPS; o resto é completado repetindo quadros. Os modelos v4 aceitam qualquer FPS.</p>}
            <Toggle checked={value.aiUhd} onChange={(v) => set('aiUhd', v)} label="Modo UHD" hint="Melhor para vídeos 4K com movimento grande." />
            <Toggle checked={value.aiTtaSpatial} onChange={(v) => set('aiTtaSpatial', v)} label="Qualidade extra espacial (TTA-s)" hint="Menos defeitos nas bordas; mais lento." />
            <Toggle checked={value.aiTtaTemporal} onChange={(v) => set('aiTtaTemporal', v)} label="Qualidade extra temporal (TTA-t)" hint="Movimento mais estável; mais lento." />
            {(() => {
              const [maj, min] = modelVersionKey(value.aiModel)
              return maj === 4 && min >= 25 ? (
                <p className="text-xs text-faint">A partir do v4.25 a comunidade marca o TTA como obsoleto: ele ainda roda, mas muda pouco o resultado.</p>
              ) : null
            })()}
          </div>
        )}
      </Sub>

      <Sub title="Velocidade e trecho">
        <Field label="Velocidade">
          <Select value={value.speed} onChange={(e) => set('speed', Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s === 1 ? 'Normal (1x)' : s < 1 ? `Câmera lenta ${s}x` : `Acelerado ${s}x`}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Início">
            <TextInput value={value.start} placeholder="0:00" onChange={(e) => set('start', e.target.value)} />
          </Field>
          <Field label="Fim">
            <TextInput value={value.end} placeholder={source?.duration ? duration(source.duration) : 'até o fim'} onChange={(e) => set('end', e.target.value)} />
          </Field>
        </div>
        {outDur != null && <p className="text-xs text-faint">Duração final: {duration(outDur)}</p>}
        {tooLong && (
          <div className="flex gap-2 rounded-lg bg-warn/10 p-2.5 text-xs text-warn">
            <TriangleAlert className="h-4 w-4 shrink-0" /> {value.name} aceita até {duration(value.maxDuration)}. Defina início e fim.
          </div>
        )}
        <Field label="Limite de duração para avisar (segundos, 0 = sem limite)">
          <TextInput type="number" min={0} value={value.maxDuration} onChange={(e) => set('maxDuration', Math.max(0, Number(e.target.value) || 0))} />
        </Field>
      </Sub>

      <Sub title="Qualidade e arquivo">
        <Field label={`Qualidade: ${value.quality} (menor = melhor, arquivo maior)`}>
          <input type="range" min={14} max={32} step={1} value={value.quality} onChange={(e) => set('quality', Number(e.target.value))} className="w-full accent-[#ff4d4d]" />
        </Field>
        <Field label="Codificador">
          <Select value={value.encoder} onChange={(e) => set('encoder', e.target.value)}>
            <option value="">Automático{caps?.encoders[0] ? ` (${ENCODER_LABEL[caps.encoders[0]] ?? caps.encoders[0]})` : ''}</option>
            {caps?.encoders.map((e) => (
              <option key={e} value={e}>
                {ENCODER_LABEL[e] ?? e}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Limite de taxa de bits (kbps, 0 = sem limite)">
          <TextInput type="number" min={0} step={500} value={value.maxBitrate} onChange={(e) => set('maxBitrate', Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        <Toggle checked={value.audio} onChange={(v) => set('audio', v)} label="Manter o áudio" hint="Desligado: vídeo mudo, para pôr música no próprio app da rede." />
        {value.audio && (
          <Field label="Qualidade do áudio">
            <Select value={value.audioKbps} onChange={(e) => set('audioKbps', Number(e.target.value))}>
              {[96, 128, 160, 192, 256, 320].map((k) => (
                <option key={k} value={k}>
                  AAC {k} kbps
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Final do nome do arquivo">
          <TextInput value={value.suffix} onChange={(e) => set('suffix', e.target.value.replace(/[\\/:*?"<>|]/g, ''))} className="font-mono text-xs" />
        </Field>
      </Sub>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {naming == null ? (
          <Button size="sm" icon={<Bookmark className="h-3.5 w-3.5" />} onClick={() => setNaming(value.name === 'Personalizado' ? '' : `${value.name} (meu)`)}>
            Salvar como predefinição
          </Button>
        ) : (
          <>
            <TextInput autoFocus value={naming} placeholder="Nome, ex.: Meu TikTok 60 fps" onChange={(e) => setNaming(e.target.value)} className="h-7 flex-1 text-xs" />
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
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNaming(null)}>
              Cancelar
            </Button>
          </>
        )}
        {(() => {
          const builtin = BUILTIN_PRESETS.find((p) => p.settings.name === value.name)?.settings ?? saved.find((p) => p.settings.name === value.name)?.settings
          return builtin ? (
            <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => apply({ ...builtin })}>
              Restaurar
            </Button>
          ) : null
        })()}
        {saved.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-faint">
            <Trash2 className="h-3 w-3" /> apague no x da predefinição
          </span>
        )}
      </div>
    </div>
  )
}
