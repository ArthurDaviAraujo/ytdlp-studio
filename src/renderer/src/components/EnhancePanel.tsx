import type { ReactNode } from 'react'
import { RotateCcw, Sparkles, TriangleAlert } from 'lucide-react'
import type { Capabilities, EnhanceSettings, ExportSettings, Upscaler } from '../../../shared/types'
import { AI_KEEP_MAX, ENHANCE_PRESETS, NO_ENHANCE, chooseScale, cuganNoises, enhanceOf, nearestNoise, neededScale, upScales, withAiSize } from '../../../shared/enhance'
import { Button, Disclosure, Field, InfoTip, Range, Segmented, Select, Toggle } from './ui'
import { t } from '../../../shared/i18n'
import type { SourceInfo } from './ExportForm'
import PackButton from './PackButton'

const ESRGAN_MODELS: { id: EnhanceSettings['esrganModel']; label: string; hint: string }[] = [
  { id: 'realesr-animevideov3', label: 'Vídeo (rápido)', hint: 'Feito para vídeo: rápido e estável entre quadros. Bom para quase tudo.' },
  { id: 'realesrgan-x4plus', label: 'Foto realista (lento)', hint: 'O mais detalhista para imagem real, mas cerca de 30x mais lento. Só amplia 4x.' },
  { id: 'realesrgan-x4plus-anime', label: 'Anime (lento)', hint: 'Para desenho, com traço mais fino. Só amplia 4x.' }
]

const CUGAN_MODELS: { id: EnhanceSettings['cuganModel']; label: string; hint: string }[] = [
  { id: 'se', label: 'Padrão', hint: 'O mais completo: 2x, 3x e 4x, com todos os níveis de limpeza.' },
  { id: 'pro', label: 'Pro', hint: 'Versão refinada: mais detalhe nos traços. 2x e 3x.' },
  { id: 'nose', label: 'Sem limpeza', hint: 'Só amplia, sem tirar ruído (preserva textura). 2x.' }
]

const NOISE_LABEL: Record<number, string> = { [-1]: 'Conservador', 0: 'Nenhuma', 1: 'Leve', 2: 'Média', 3: 'Forte' }

/** Seção com título; o "i" ao lado do título explica o que ela faz com a imagem */
function Sub({ title, desc, actions, children }: { title: ReactNode; desc: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-3 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
          {title}
          <InfoTip>{desc}</InfoTip>
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

/** Nome de uma opção com o "i" ao lado */
const Tip = ({ text, children }: { text: ReactNode; children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5">
    {text}
    <InfoTip>{children}</InfoTip>
  </span>
)

const pct = (v: number) => (v > 0 ? `+${v}` : String(v))
const level = (v: number) => (v ? String(v) : t('não'))

export default function EnhancePanel({
  value,
  onChange,
  caps,
  upscalers,
  source
}: {
  value: ExportSettings
  onChange: (s: ExportSettings) => void
  caps: Capabilities | null
  upscalers: { esrgan: string | null; cugan: string | null }
  source: SourceInfo | null
}) {
  const e = enhanceOf(value)
  const set = (patch: Partial<EnhanceSettings>) => onChange({ ...value, enhance: { ...e, ...patch } })
  const setNum = <K extends keyof EnhanceSettings>(k: K) => (v: number) => set({ [k]: v } as Partial<EnhanceSettings>)

  // Receita: troca toda a parte de imagem e mantém o som (a "Voz limpa" só mexe no som)
  const applyPreset = (patch: Partial<EnhanceSettings>) => {
    const audioOnly = Object.keys(patch).every((k) => k.startsWith('audio'))
    if (audioOnly) return set(patch)
    onChange({ ...value, enhance: { ...NO_ENHANCE, audioDenoise: e.audioDenoise, audioCut: e.audioCut, audioLevel: e.audioLevel, ...patch } })
  }
  const resetImage = () => onChange({ ...value, enhance: { ...NO_ENHANCE, audioDenoise: e.audioDenoise, audioCut: e.audioCut, audioLevel: e.audioLevel } })

  // Tamanho que chega na IA, o fator e o tamanho final, para mostrar o caminho da imagem
  const scaleInfo = (() => {
    if (!source || e.upscaler === 'none') return null
    const s = withAiSize(value, source)
    const need = neededScale(source, s)
    const k = chooseScale(e, need)
    // Com corte, a IA recebe só a área recortada
    const cropped = s.framing === 'crop' || Math.abs(source.width / source.height - s.width / s.height) < 0.01
    const inW = cropped ? Math.round(s.width / need) : source.width
    const inH = cropped ? Math.round(s.height / need) : source.height
    const capped = !value.width && !value.height && Math.max(source.width, source.height) * k > AI_KEEP_MAX
    return { need, k, W: s.width, H: s.height, inW, inH, capped, auto: chooseScale({ ...e, upScale: 0 }, need) }
  })()
  const scales = upScales(e)
  const k = scaleInfo?.k ?? scales[0] ?? 2
  const noises = cuganNoises(e.cuganModel, k)
  const noise = nearestNoise(e.cuganModel, k, e.cuganNoise)

  const colorChanged = !!(e.brightness || e.contrast || e.saturation || e.vibrance || e.gamma || e.warmth || e.autoLight)
  const engines: { value: Upscaler; label: string; disabled?: boolean }[] = [
    { value: 'none', label: t('Desligado') },
    { value: 'esrgan', label: 'Real-ESRGAN', disabled: !upscalers.esrgan },
    { value: 'cugan', label: 'Real-CUGAN', disabled: !upscalers.cugan }
  ]

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
            {t('Receitas prontas')}
            <InfoTip>{t('Um clique liga vários ajustes de uma vez. Depois dá para mudar cada um. Passe o mouse numa receita para ver o que ela faz.')}</InfoTip>
          </div>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={resetImage}>
            {t('Tirar tudo')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ENHANCE_PRESETS.map((p) => (
            <button key={p.id} title={t(p.hint)} onClick={() => applyPreset(p.patch)} className="rounded-lg border border-line bg-panel-2 px-2.5 py-1 text-xs text-muted hover:border-accent/50 hover:text-text">
              {t(p.name)}
            </button>
          ))}
        </div>
      </div>

      <Sub
        title={
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-warn" />
            {t('Ampliar com IA')}
          </span>
        }
        desc={
          <>
            {t('Deixa o vídeo maior e mais definido: a IA redesenha bordas, rostos e texturas em vez de só esticar os pixels. Serve para vídeo pequeno ou borrado. Roda na placa de vídeo e é a parte mais demorada.')}
            <br />
            <br />
            {t('Real-ESRGAN: bom para vídeo real (pessoas, carros, paisagem). Real-CUGAN: feito para anime e desenho.')}
          </>
        }
      >
        <Segmented<Upscaler> value={e.upscaler} onChange={(u) => set({ upscaler: u })} options={engines} />
        {(!upscalers.esrgan || !upscalers.cugan) && (
          <div className="flex flex-wrap gap-2">
            {!upscalers.esrgan && <PackButton id="realesrgan" />}
            {!upscalers.cugan && <PackButton id="realcugan" />}
          </div>
        )}

        {e.upscaler === 'esrgan' && (
          <Field label={<Tip text={t('Modelo')}>{t(ESRGAN_MODELS.find((m) => m.id === e.esrganModel)?.hint ?? '')}</Tip>}>
            <Select value={e.esrganModel} onChange={(x) => set({ esrganModel: x.target.value as EnhanceSettings['esrganModel'] })}>
              {ESRGAN_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {t(m.label)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {e.upscaler === 'cugan' && (
          <Field label={<Tip text={t('Modelo')}>{t(CUGAN_MODELS.find((m) => m.id === e.cuganModel)?.hint ?? '')}</Tip>}>
            <Select value={e.cuganModel} onChange={(x) => set({ cuganModel: x.target.value as EnhanceSettings['cuganModel'] })}>
              {CUGAN_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {t(m.label)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {e.upscaler !== 'none' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label={<Tip text={t('Ampliar')}>{t('Quantas vezes a IA aumenta a imagem. “Automático” usa o menor aumento que já chega ao tamanho final; depois a imagem é ajustada ao tamanho da aba Formato.')}</Tip>}>
                <Select value={scales.includes(e.upScale) ? e.upScale : 0} onChange={(x) => set({ upScale: Number(x.target.value) })}>
                  <option value={0}>
                    {t('Automático')}
                    {scaleInfo ? ` (${scaleInfo.auto}x)` : ''}
                  </option>
                  {scales.map((k) => (
                    <option key={k} value={k}>
                      {k}x
                    </option>
                  ))}
                </Select>
              </Field>
              {e.upscaler === 'cugan' && (
                <Field label={<Tip text={t('Tirar ruído')}>{t('“Tirar ruído” é a limpeza feita pela própria IA: mais forte deixa as cores mais lisas.')}</Tip>}>
                  <Select value={noise} onChange={(x) => set({ cuganNoise: Number(x.target.value) })}>
                    {noises.map((n) => (
                      <option key={n} value={n}>
                        {t(NOISE_LABEL[n])}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
            {scaleInfo && (
              <p className="rounded-lg bg-panel-2 px-2.5 py-2 text-xs text-muted">
                {scaleInfo.inW}×{scaleInfo.inH} → <span className="text-warn">{t('IA {k}x', { k: scaleInfo.k })}</span> → <span className="text-text">{scaleInfo.W}×{scaleInfo.H}</span>
                {scaleInfo.capped && <span className="text-faint"> · {t('sem tamanho escolhido, o resultado fica em até 4K')}</span>}
              </p>
            )}
            {scaleInfo && scaleInfo.need <= 1.01 && (
              <p className="flex items-start gap-1.5 text-xs text-warn">
                <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
                {t('O vídeo já é do tamanho final ou maior. A IA só vai redesenhar os detalhes e depois reduzir: demora bem mais e a diferença costuma ser pequena.')}
              </p>
            )}
            {e.upscaler === 'esrgan' && e.esrganModel !== 'realesr-animevideov3' && (
              <p className="flex items-start gap-1.5 text-xs text-err">
                <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
                {t('Muito lento: na RX 7600, 3 s de vídeo 360p levaram 5 min. Use “Estimar o tempo” antes.')}
              </p>
            )}
            <Disclosure title={t('Ajustes finos da IA')}>
              <Range label={t('Mistura com o original')} value={e.upBlend} min={0} max={100} step={5} neutral={100} format={(v) => `${v}% IA`} onChange={setNum('upBlend')} info={t('Abaixo de 100% a imagem fica mais natural, com menos cara de pintura.')} />
              <Toggle checked={e.upTta} onChange={(v) => set({ upTta: v })} label={<Tip text={t('Qualidade extra (TTA)')}>{t('Menos defeitos, mas cerca de 8x mais lento.')}</Tip>} />
              <div className="grid grid-cols-2 gap-2">
                <Field label={<Tip text={t('Bloco na placa')}>{t('Bloco menor usa menos memória da placa; use se a IA der erro de memória.')}</Tip>}>
                  <Select value={e.upTile} onChange={(x) => set({ upTile: Number(x.target.value) })}>
                    <option value={0}>{t('Automático')}</option>
                    {[512, 256, 128, 64].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('Placa de vídeo')}>
                  <Select value={value.aiGpu ?? -1} onChange={(x) => onChange({ ...value, aiGpu: Number(x.target.value) })}>
                    <option value={-1}>{t('Automática')}</option>
                    {caps?.gpus.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </Disclosure>
          </>
        )}
      </Sub>

      <Sub title={t('Limpeza')} desc={t('Tira a sujeira que já veio no vídeo: pontinhos de ruído, quadradinhos de compressão e “degraus” de cor. Não muda as cores nem o tamanho.')}>
        <Range label={t('Tirar ruído e granulado')} value={e.denoise} min={0} max={10} onChange={setNum('denoise')} format={level} info={t('Some com os pontinhos que piscam, comuns em vídeo escuro ou de celular. Forte demais deixa pele e texturas lisas, como plástico.')} />
        {e.denoise > 0 && (
          <Field label={<Tip text={t('Jeito de tirar o ruído')}>{t('Rápido: quase não aumenta o tempo de preparo.')} {t('Melhor: guarda mais detalhe, mas deixa o preparo bem mais lento.')}</Tip>}>
            <Segmented<EnhanceSettings['denoiseMethod']>
              value={e.denoiseMethod}
              onChange={(m) => set({ denoiseMethod: m })}
              options={[
                { value: 'fast', label: t('Rápido') },
                { value: 'quality', label: t('Melhor (lento)') }
              ]}
            />
          </Field>
        )}
        <Range label={t('Tirar quadradinhos da compressão')} value={e.deblock} min={0} max={10} onChange={setNum('deblock')} format={level} info={t('Suaviza os blocos que aparecem em vídeo muito comprimido (WhatsApp, repostagens), principalmente em partes escuras e lisas.')} />
        <Toggle checked={e.deband} onChange={(v) => set({ deband: v })} label={<Tip text={t('Suavizar faixas no céu e em degradês')}>{t('Some com as faixas em “escadinha” que aparecem no céu, em paredes e em fundos lisos.')}</Tip>} />
        <Toggle checked={e.deinterlace} onChange={(v) => set({ deinterlace: v })} label={<Tip text={t('Desentrelaçar')}>{t('Para gravações de TV e câmeras antigas com listras horizontais no movimento.')}</Tip>} />
      </Sub>

      <Sub title={t('Nitidez')} desc={t('Realça os contornos para a imagem parecer mais definida. Não cria detalhe novo (isso é a IA); exagerar cria uma borda clara em volta das coisas.')}>
        <Range label={t('Nitidez')} value={e.sharpen} min={0} max={10} onChange={setNum('sharpen')} format={level} info={t('De 2 a 4 costuma bastar. Bom depois de reduzir ou ampliar o vídeo.')} />
        {e.sharpen > 0 && (
          <Field label={<Tip text={t('Tipo de nitidez')}>{t('Natural: realça mais onde a imagem está borrada e menos onde já está nítida.')} {t('Forte: realça tudo por igual; marca mais, mas também realça o ruído.')}</Tip>}>
            <Segmented<EnhanceSettings['sharpenMethod']>
              value={e.sharpenMethod}
              onChange={(m) => set({ sharpenMethod: m })}
              options={[
                { value: 'cas', label: t('Natural (CAS)') },
                { value: 'unsharp', label: t('Forte (unsharp)') }
              ]}
            />
          </Field>
        )}
      </Sub>

      <Sub
        title={t('Cor e luz')}
        desc={
          <>
            {t('Muda o visual da imagem: mais clara ou escura, cores mais fortes ou mais fracas, tom mais quente (laranja) ou mais frio (azul).')} {t('Duplo clique numa barra volta ao normal.')}
          </>
        }
        actions={
          colorChanged ? (
            <Button size="sm" variant="ghost" onClick={() => set({ brightness: 0, contrast: 0, saturation: 0, vibrance: 0, gamma: 0, warmth: 0, autoLight: false })}>
              {t('Zerar')}
            </Button>
          ) : null
        }
      >
        <Toggle checked={e.autoLight} onChange={(v) => set({ autoLight: v })} label={<Tip text={t('Corrigir a luz automaticamente')}>{t('Estica o preto e o branco de cada cena. Bom para vídeo apagado ou escuro.')}</Tip>} />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Range label={t('Brilho')} value={e.brightness} min={-100} max={100} step={5} onChange={setNum('brightness')} format={pct} info={t('clareia ou escurece a imagem toda por igual.')} />
          <Range label={t('Contraste')} value={e.contrast} min={-100} max={100} step={5} onChange={setNum('contrast')} format={pct} info={t('separa mais o claro do escuro; negativo deixa tudo mais cinza.')} />
          <Range label={t('Sombras')} value={e.gamma} min={-100} max={100} step={5} onChange={setNum('gamma')} format={pct} info={t('clareia só as partes escuras e médias, sem estourar o céu.')} />
          <Range label={t('Saturação')} value={e.saturation} min={-100} max={100} step={5} onChange={setNum('saturation')} format={pct} info={t('força de todas as cores; −100 deixa preto e branco.')} />
          <Range label={t('Vibração')} value={e.vibrance} min={-100} max={100} step={5} onChange={setNum('vibrance')} format={pct} info={t('realça só as cores fracas, sem exagerar pele e cores já fortes.')} />
          <Range label={t('Temperatura')} value={e.warmth} min={-100} max={100} step={5} onChange={setNum('warmth')} format={(v) => (v > 0 ? t('+{n} quente', { n: v }) : v < 0 ? t('{n} frio', { n: v }) : '0')} info={t('puxa para laranja (quente) ou para azul (frio).')} />
        </div>
      </Sub>

      <Sub title={t('Correções')} desc={t('Conserta problemas da gravação: câmera tremida e luz piscando. O granulado faz o contrário da limpeza: põe textura de filme de propósito.')}>
        <Field
          label={
            <Tip text={t('Estabilizar a câmera')}>
              {t('Deixa a imagem mais firme quando a câmera estava na mão.')}
              <br />
              <br />
              {t('Leve')}: {t('Rápido, corrige tremidas pequenas.')}
              <br />
              {t('Forte')}: {t('Analisa o vídeo inteiro antes (2 passadas) e aproxima um pouco a imagem para esconder as bordas.')}
            </Tip>
          }
        >
          <Segmented<EnhanceSettings['stabilize']>
            value={e.stabilize}
            onChange={(v) => set({ stabilize: v })}
            options={[
              { value: 'off', label: t('Não') },
              { value: 'light', label: t('Leve') },
              { value: 'strong', label: t('Forte') }
            ]}
          />
        </Field>
        <Toggle
          checked={e.autoCrop}
          onChange={(v) => set({ autoCrop: v })}
          label={<Tip text={t('Cortar bordas pretas sozinho')}>{t('Procura faixas pretas fixas em volta da imagem (vídeo antigo 4:3 dentro de 16:9, gravação de tela, vídeo com tarja) e corta antes de tudo. Depois disso o enquadramento usa só a imagem de dentro. A prévia de cima não mostra esse corte; a de antes e depois mostra.')}</Tip>}
        />
        <Toggle checked={e.deflicker} onChange={(v) => set({ deflicker: v })} label={<Tip text={t('Tirar o pisca-pisca da luz')}>{t('Para lâmpadas que piscam na gravação e timelapses.')}</Tip>} />
        <Range label={t('Granulado de filme')} value={e.grain} min={0} max={10} onChange={setNum('grain')} format={level} info={t('Um granulado leve esconde as faixas e deixa a imagem com cara de cinema.')} />
      </Sub>
    </div>
  )
}
