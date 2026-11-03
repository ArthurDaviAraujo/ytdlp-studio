import { useState, type CSSProperties } from 'react'
import { RotateCcw, Volume2, VolumeX, X } from 'lucide-react'
import { cx } from './ui'
import type { EqSettings } from '../../../shared/types'
import { EQ_FLAT, EQ_RANGE } from '../../../shared/audio'
import { t, type Lang } from '../../../shared/i18n'

export interface MixerChannel {
  id: string
  label: string
  /** 0–2 */
  value: number
  onChange: (v: number) => void
  eq: EqSettings
  onEq: (eq: EqSettings) => void
  /** Nível de 0 a 1 do que está tocando (vem do editor) */
  level: number
}

/** O que o editor manda para a janela do mixer */
export interface MixerState {
  lang: Lang
  channels: { id: string; label: string; value: number; eq: EqSettings }[]
}
export type EditorToMixer = { type: 'state'; state: MixerState } | { type: 'levels'; levels: Record<string, number> } | { type: 'closed' }
export type MixerToEditor = { type: 'hello' } | { type: 'set'; id: string; value: number } | { type: 'eq'; id: string; eq: EqSettings } | { type: 'reset' }

// Arrastar a janela pelo topo (janela sem moldura); botões e controles continuam clicáveis
const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties

const VERTICAL = { writingMode: 'vertical-lr', direction: 'rtl' } as CSSProperties

/** Controle vertical de uma faixa do equalizador (−12 a +12 dB) */
function Knob({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex w-9 flex-col items-center gap-1" onDoubleClick={() => onChange(0)} title={t('Duplo clique volta para 0 dB')}>
      <span className={cx('font-mono text-[10px] tabular-nums', value !== 0 ? 'text-text' : 'text-faint')}>
        {value > 0 ? '+' : ''}
        {value.toFixed(1)}
      </span>
      <input type="range" min={-EQ_RANGE} max={EQ_RANGE} step={0.5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-32 w-5 accent-[#ff4d4d]" style={VERTICAL} aria-label={label} />
      <span className="text-[10px] text-muted">{label}</span>
    </div>
  )
}

function Strip({ ch }: { ch: MixerChannel }) {
  const level = ch.level
  const [last, setLast] = useState(ch.value || 1)
  const muted = ch.value === 0
  const band = (k: keyof EqSettings) => (v: number) => ch.onEq({ ...ch.eq, [k]: v })
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-panel-2 p-2.5">
      <div className="flex items-center gap-1">
        <span className="flex-1 truncate text-xs font-semibold" title={ch.label}>
          {ch.label}
        </span>
        <button className="rounded p-0.5 text-faint hover:bg-panel-3 hover:text-text" title={t('Zerar o equalizador')} onClick={() => ch.onEq(EQ_FLAT)}>
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>
      <div className="flex items-stretch gap-0.5">
        {/* Equalizador: tudo na vertical, como numa mesa de som */}
        <Knob label={t('Ganho')} value={ch.eq.gain} onChange={band('gain')} />
        <Knob label={t('Agudo')} value={ch.eq.treble} onChange={band('treble')} />
        <Knob label={t('Médio')} value={ch.eq.mid} onChange={band('mid')} />
        <Knob label={t('Grave')} value={ch.eq.bass} onChange={band('bass')} />
        <div className="mx-1 w-px bg-line" />
        {/* Volume com o medidor ao lado: verde, amarelo perto do máximo, vermelho estourando */}
        <div className="flex w-12 flex-col items-center gap-1">
          <span className="font-mono text-[10px] tabular-nums text-text">{Math.round(ch.value * 100)}%</span>
          <div className="flex h-32 items-stretch gap-1.5">
            <div className="relative w-2 overflow-hidden rounded-full bg-panel-3">
              <div className={cx('absolute inset-x-0 bottom-0 rounded-full', level > 0.95 ? 'bg-err' : level > 0.7 ? 'bg-warn' : 'bg-ok')} style={{ height: `${level * 100}%` }} />
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={ch.value}
              onChange={(e) => {
                const v = Number(e.target.value)
                ch.onChange(v)
                if (v > 0) setLast(v)
              }}
              onDoubleClick={() => ch.onChange(1)}
              className="h-32 w-5 accent-[#ff4d4d]"
              style={VERTICAL}
              aria-label={ch.label}
            />
          </div>
          <span className="text-[10px] text-muted">{t('Volume')}</span>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          className={cx('flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px]', muted ? 'bg-err/20 text-err' : 'text-muted hover:bg-panel-3 hover:text-text')}
          title={muted ? t('Tirar o mudo') : t('Mudo')}
          onClick={() => ch.onChange(muted ? last : 0)}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {muted ? t('Mudo') : null}
        </button>
      </div>
    </div>
  )
}

/** Mesa de som (fica numa janela própria): volume, ganho e equalizador de cada som, com medidores. */
export default function Mixer({ channels, onReset, onClose }: { channels: MixerChannel[]; onReset: () => void; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col bg-bg text-text select-none">
      <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-2" style={DRAG}>
        <span className="flex-1 text-xs font-semibold">{t('Mixer')}</span>
        <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-panel-3 hover:text-text" style={NO_DRAG} title={t('Restaurar volumes')} onClick={onReset}>
          <RotateCcw className="h-3 w-3" />
          {t('Restaurar')}
        </button>
        <button className="rounded p-1 text-muted hover:bg-err/20 hover:text-err" style={NO_DRAG} title={t('Fechar')} onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-1 justify-center gap-2 p-3">
        {channels.length ? (
          channels.map((ch) => <Strip key={ch.id} ch={ch} />)
        ) : (
          <p className="self-center text-center text-xs text-muted">{t('O vídeo não tem som.')}</p>
        )}
      </div>
      <p className="px-3 pb-2 text-[10px] leading-tight text-faint">{t('Duplo clique num controle volta ao padrão. O arquivo final sai com estes ajustes. Arraste pelo topo para mover a janela.')}</p>
    </div>
  )
}
