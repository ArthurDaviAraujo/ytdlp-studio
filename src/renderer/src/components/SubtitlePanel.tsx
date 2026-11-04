import type { ExportSettings, SubtitleSettings, ToolStatus, WhisperModel } from '../../../shared/types'
import { SUB_LANGS, subtitlesOf } from '../../../shared/subtitles'
import { whisperPack } from '../../../shared/packs'
import { Field, InfoTip, Range, Segmented, Select, Toggle, WithTip } from './ui'
import PackButton from './PackButton'
import { t } from '../../../shared/i18n'

const MODELS: { id: WhisperModel; label: string }[] = [
  { id: 'base', label: 'Rápido (base)' },
  { id: 'small', label: 'Melhor (small)' },
  { id: 'turbo', label: 'Máximo (large-v3 turbo)' }
]

/** Legendas automáticas: o Whisper ouve a fala e o app escreve na tela (ou só salva o .srt) */
export default function SubtitlePanel({ value, onChange, whisper }: { value: ExportSettings; onChange: (s: ExportSettings) => void; whisper: ToolStatus['whisper'] | null }) {
  const sub = subtitlesOf(value)
  const set = (patch: Partial<SubtitleSettings>) => onChange({ ...value, subtitles: { ...sub, ...patch } })
  const hasExe = !!whisper?.exe
  const hasModel = !!whisper?.models.includes(sub.model)

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <div className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
        {t('Legendas automáticas')}
        <InfoTip>
          {t('O Whisper (IA) ouve a fala do vídeo, escreve o que foi dito com o tempo de cada palavra e o app põe a legenda no vídeo. Roda no seu PC, sem internet, depois de baixado.')}
          <br />
          <br />
          {t('Estilo TikTok: poucas palavras por vez, grandes, com a palavra falada em destaque. Frase: a frase inteira embaixo, como no cinema.')}
        </InfoTip>
      </div>
      <Toggle checked={sub.on} onChange={(v) => set({ on: v })} label={t('Pôr legenda com o que é falado')} />
      {sub.on && (
        <>
          {!hasExe && (
            <div className="space-y-1.5 rounded-lg bg-panel-2 p-2.5 text-xs text-muted">
              <p>{t('O programa das legendas ainda não está no PC.')}</p>
              <PackButton id="whisper" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label={<WithTip text={t('Modelo')}>{t('Rápido: bom para fala clara, poucos segundos. Melhor: erra menos com sotaque e barulho; uns 3x mais lento. Máximo: o que mais acerta, o mais lento.')}</WithTip>}>
              <Select value={sub.model} onChange={(e) => set({ model: e.target.value as WhisperModel })}>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {t(m.label)}
                    {whisper?.models.includes(m.id) ? '' : ' ↓'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('Idioma falado')}>
              <Select value={sub.language} onChange={(e) => set({ language: e.target.value })}>
                {SUB_LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {t(l.label)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {!hasModel && <PackButton id={whisperPack(sub.model)} />}
          <Toggle
            checked={sub.translate}
            onChange={(v) => set({ translate: v })}
            label={<WithTip text={t('Traduzir para o inglês')}>{t('A fala em qualquer idioma vira legenda em inglês. O Whisper só traduz para o inglês.')}</WithTip>}
          />
          <Field label={t('Estilo')}>
            <Segmented<SubtitleSettings['style']>
              value={sub.style}
              onChange={(v) => set({ style: v })}
              options={[
                { value: 'tiktok', label: 'TikTok' },
                { value: 'classic', label: t('Frase') },
                { value: 'none', label: t('Só .srt') }
              ]}
            />
          </Field>
          {sub.style !== 'none' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('Posição')}>
                  <Select value={sub.position} onChange={(e) => set({ position: e.target.value as SubtitleSettings['position'] })}>
                    <option value="bottom">{t('Embaixo')}</option>
                    <option value="middle">{t('No meio')}</option>
                    <option value="top">{t('Em cima')}</option>
                  </Select>
                </Field>
                {sub.style === 'tiktok' && (
                  <Field label={t('Cor do destaque')}>
                    <div className="flex items-center gap-2">
                      <input type="color" value={sub.color} onChange={(e) => set({ color: e.target.value })} className="h-9 w-14 cursor-pointer rounded border border-line bg-panel-2" />
                      <code className="text-xs text-muted">{sub.color}</code>
                    </div>
                  </Field>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4">
                <Range label={t('Tamanho')} value={sub.size} min={3} max={12} step={0.5} neutral={6} format={(v) => `${v}%`} onChange={(v) => set({ size: v })} info={t('Altura da letra em relação à altura do vídeo.')} />
                {sub.style === 'tiktok' && <Range label={t('Palavras por vez')} value={sub.words} min={1} max={6} neutral={3} onChange={(v) => set({ words: v })} />}
              </div>
              <Toggle checked={sub.upper} onChange={(v) => set({ upper: v })} label={t('Tudo em maiúsculas')} />
            </>
          )}
          <Toggle
            checked={sub.srt || sub.style === 'none'}
            onChange={(v) => set({ srt: v })}
            label={<WithTip text={t('Salvar também o arquivo .srt')}>{t('Um arquivo de legenda ao lado do vídeo, para subir no YouTube ou abrir em outro editor.')}</WithTip>}
          />
        </>
      )}
    </div>
  )
}
