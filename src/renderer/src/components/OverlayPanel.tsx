import { ImagePlus, X } from 'lucide-react'
import type { ExportSettings, OverlaySettings, ScreenPos } from '../../../shared/types'
import { SCREEN_POS, overlayOf } from '../../../shared/overlay'
import { Button, Field, InfoTip, Range, Select, TextInput, Toggle, WithTip } from './ui'
import { t } from '../../../shared/i18n'

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p

function PosSelect({ value, onChange }: { value: ScreenPos; onChange: (p: ScreenPos) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as ScreenPos)}>
      {SCREEN_POS.map((p) => (
        <option key={p.id} value={p.id}>
          {t(p.label)}
        </option>
      ))}
    </Select>
  )
}

/** Texto (ex.: @ do perfil, título) e logo por cima do vídeo final */
export default function OverlayPanel({ value, onChange }: { value: ExportSettings; onChange: (s: ExportSettings) => void }) {
  const o = overlayOf(value)
  const set = (patch: Partial<OverlaySettings>) => onChange({ ...value, overlay: { ...o, ...patch } })
  const pickLogo = async () => {
    const p = await window.api.pickFile(o.logo, t('Imagens'), ['png', 'jpg', 'jpeg', 'webp'])
    if (p) set({ logo: p })
  }

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <div className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
        {t('Texto e logo')}
        <InfoTip>{t('Escreve um texto (como o @ do seu perfil ou um título) e/ou põe uma imagem, como um logo, por cima do vídeo inteiro. A posição e o tamanho acompanham o tamanho final do vídeo. Logo em PNG com fundo transparente fica melhor.')}</InfoTip>
      </div>
      <Field label={t('Texto')}>
        <TextInput value={o.text} placeholder={t('ex.: @seuperfil')} onChange={(e) => set({ text: e.target.value })} />
      </Field>
      {o.text.trim() && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('Posição do texto')}>
              <PosSelect value={o.textPos} onChange={(p) => set({ textPos: p })} />
            </Field>
            <Field label={t('Cor')}>
              <div className="flex items-center gap-2">
                <input type="color" value={o.textColor} onChange={(e) => set({ textColor: e.target.value })} className="h-9 w-14 cursor-pointer rounded border border-line bg-panel-2" />
                <code className="text-xs text-muted">{o.textColor}</code>
              </div>
            </Field>
          </div>
          <Range label={t('Tamanho do texto')} value={o.textSize} min={2} max={15} step={0.5} neutral={5} format={(v) => `${v}%`} onChange={(v) => set({ textSize: v })} info={t('Altura da letra em relação à altura do vídeo.')} />
          <Toggle
            checked={o.textBox}
            onChange={(v) => set({ textBox: v })}
            label={<WithTip text={t('Faixa escura atrás do texto')}>{t('Ligado: o texto fica sobre uma faixa preta transparente. Desligado: o texto ganha um contorno preto. Os dois deixam o texto legível em qualquer fundo.')}</WithTip>}
          />
        </>
      )}
      <Field label={t('Logo')}>
        {o.logo ? (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-xs" title={o.logo}>
              {baseName(o.logo)}
            </span>
            <Button size="sm" variant="ghost" onClick={pickLogo}>
              {t('Trocar')}
            </Button>
            <button className="rounded p-1.5 text-muted hover:bg-panel-3 hover:text-err" title={t('Tirar o logo')} onClick={() => set({ logo: '' })}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Button size="sm" icon={<ImagePlus className="h-3.5 w-3.5" />} onClick={pickLogo}>
            {t('Escolher imagem')}
          </Button>
        )}
      </Field>
      {o.logo && (
        <>
          <Field label={t('Posição do logo')}>
            <PosSelect value={o.logoPos} onChange={(p) => set({ logoPos: p })} />
          </Field>
          <div className="grid grid-cols-2 gap-x-4">
            <Range label={t('Tamanho')} value={o.logoSize} min={4} max={60} neutral={15} format={(v) => `${v}%`} onChange={(v) => set({ logoSize: v })} info={t('Largura do logo em relação à largura do vídeo.')} />
            <Range label={t('Opacidade')} value={o.logoOpacity} min={10} max={100} step={5} neutral={90} format={(v) => `${v}%`} onChange={(v) => set({ logoOpacity: v })} />
          </div>
        </>
      )}
    </div>
  )
}
