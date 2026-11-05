import { useEffect, useState } from 'react'
import { Clapperboard, FileVideo, Gauge, Image as ImageIcon, Ratio, Sparkles, Type, Wand2 } from 'lucide-react'
import type { ExportSettings, FrameMethod, Framing, ScreenPos } from '../../../src/shared/types'
import { BUILTIN_PRESETS } from '../../../src/shared/presets'
import { enhanceOf } from '../../../src/shared/enhance'
import { overlayOf, SCREEN_POS } from '../../../src/shared/overlay'
import { t } from '../../../src/shared/i18n'
import { engine, type ProbeInfo } from '../native'
import { addJob } from '../jobs'
import { Button, Card, Chip, Field, Range, Section, Segmented, Select, TextInput, Tip, Toggle, cx } from '../ui'
import { PackInline, usePack } from '../PackRow'
import type { Ctx } from '../App'

const KEY = 'mobile-prepare'
const SIZES = [
  { id: 'keep', label: 'Manter o original', w: 0, h: 0 },
  { id: '9:16', label: '9:16 vertical (1080×1920)', w: 1080, h: 1920 },
  { id: '4:5', label: '4:5 retrato (1080×1350)', w: 1080, h: 1350 },
  { id: '1:1', label: '1:1 quadrado (1080×1080)', w: 1080, h: 1080 },
  { id: '16:9', label: '16:9 deitado (1920×1080)', w: 1920, h: 1080 }
]

function load(): ExportSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (s) return { ...BUILTIN_PRESETS[0].settings, ...s, start: '', end: '' }
  } catch {
    // começa no TikTok
  }
  return { ...BUILTIN_PRESETS[0].settings, method: 'duplicate' }
}

export default function PreparePage({ ctx, initial, clearInitial }: { ctx: Ctx; initial: { path: string; name: string } | null; clearInitial: () => void }) {
  const [s, setS] = useState<ExportSettings>(load)
  const [file, setFile] = useState<{ path: string; name: string } | null>(initial)
  const [info, setInfo] = useState<ProbeInfo | null>(null)
  const [thumb, setThumb] = useState<string | null>(null)
  const rife = usePack('rife')
  const esrgan = usePack('esrgan')
  const vulkan = !!ctx.status?.vulkan
  const set = <K extends keyof ExportSettings>(k: K, v: ExportSettings[K]) => setS((cur) => ({ ...cur, [k]: v }))
  const e = enhanceOf(s)
  const o = overlayOf(s)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      // ignora
    }
  }, [s])
  useEffect(() => {
    if (initial) {
      setFile(initial)
      clearInitial()
    }
  }, [initial, clearInitial])
  useEffect(() => {
    setInfo(null)
    setThumb(null)
    if (!file) return
    void engine.probe({ path: file.path }).then(setInfo)
    void engine.frame({ path: file.path, time: 1, width: 480 }).then((r) => setThumb(r.data))
  }, [file])

  const pick = async () => {
    const r = await engine.pickVideo()
    if (r.path) setFile({ path: r.path, name: r.name ?? 'video.mp4' })
  }

  const run = () => {
    if (!file || !info) return
    const W = s.width || info.width
    const H = s.height || info.height
    const extras = [s.method === 'ai' && s.fps ? 'RIFE' : '', e.upscaler !== 'none' ? 'Real-ESRGAN' : ''].filter(Boolean).join(' + ')
    addJob('prepare', file.name, thumb, `${t(s.name)} · ${W}×${H}${s.fps ? ` · ${s.fps} fps` : ''}${extras ? ` · ${extras}` : ''}`, { type: 'prepare', input: file.path, settings: s })
    ctx.toast(t('Adicionado à fila'))
    ctx.goTo('queue')
  }

  const outW = s.width || info?.width || 1080
  const outH = s.height || info?.height || 1920
  const size = SIZES.find((x) => x.w === s.width && x.h === s.height)?.id ?? 'keep'
  const aiFramesOn = s.method === 'ai'
  const sameShape = info ? Math.abs(info.width / info.height - outW / outH) < 0.01 : false

  return (
    <div className="space-y-4 p-4 pb-28">
      {!file ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Clapperboard className="h-10 w-10 text-faint" />
          <div className="text-[15px] font-medium">{t('Escolha um vídeo')}</div>
          <p className="text-[13px] text-muted">{t('Da galeria, ou toque em "Preparar" num download concluído.')}</p>
          <Button variant="primary" icon={<FileVideo className="h-4 w-4" />} onClick={pick}>
            {t('Escolher da galeria')}
          </Button>
        </Card>
      ) : (
        <>
          {/* Prévia: o quadro do vídeo já no formato final */}
          <div className="flex items-start gap-3">
            <div className="relative shrink-0 overflow-hidden rounded-xl border border-line bg-black" style={{ width: outW >= outH ? 168 : 112, aspectRatio: `${outW} / ${outH}`, background: s.framing === 'bars' && !sameShape ? s.barColor : '#000' }}>
              {thumb && s.framing === 'blur' && !sameShape && <img src={thumb} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover blur-md" />}
              {thumb && (
                <img
                  src={thumb}
                  alt=""
                  className={cx('absolute inset-0 h-full w-full', s.framing === 'crop' || sameShape ? 'object-cover' : 'object-contain')}
                  style={s.framing === 'crop' ? { objectPosition: `${s.position}% ${s.positionY ?? 50}%`, transform: `scale(${s.zoom || 1})` } : undefined}
                />
              )}
              {o.text.trim() && (
                <span className={cx('absolute inset-x-1 truncate text-center text-[9px] font-bold', o.textPos[0] === 't' ? 'top-1' : o.textPos[0] === 'm' ? 'top-1/2' : 'bottom-1')} style={{ color: o.textColor, textShadow: '0 0 3px #000' }}>
                  {o.text}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="truncate text-[15px] font-medium">{file.name}</div>
              {info && (
                <div className="text-[13px] text-muted">
                  {info.width}×{info.height} · {Math.round(info.fps)} fps · {Math.round(info.duration)} s
                </div>
              )}
              <div className="text-[13px] text-info">
                → {outW}×{outH}
                {s.fps ? ` · ${s.fps} fps` : ''}
              </div>
              <Button size="sm" variant="ghost" className="-ml-3" onClick={pick}>
                {t('Trocar vídeo')}
              </Button>
            </div>
          </div>

          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {BUILTIN_PRESETS.map((p) => (
              <Chip key={p.id} active={s.name === p.settings.name} onClick={() => setS({ ...p.settings, method: s.method, enhance: s.enhance, overlay: s.overlay })}>
                {t(p.settings.name)}
              </Chip>
            ))}
          </div>

          <Section title={t('Formato')} icon={<Ratio className="h-5 w-5" />} defaultOpen>
            <Field label={t('Tamanho')}>
              <Select value={size} onChange={(ev) => { const z = SIZES.find((x) => x.id === ev.target.value)!; setS((c) => ({ ...c, width: z.w, height: z.h })) }}>
                {SIZES.map((z) => (
                  <option key={z.id} value={z.id}>
                    {t(z.label)}
                  </option>
                ))}
              </Select>
            </Field>
            {!sameShape && (
              <>
                <Field label={<>{t('Enquadramento')} <Tip>{t('Cortar: corta as laterais e enche a tela. Fundo desfocado: o vídeo inteiro no meio, com ele mesmo borrado atrás. Barras: o vídeo inteiro com faixas de cor.')}</Tip></>}>
                  <Segmented<Framing>
                    value={s.framing}
                    onChange={(f) => set('framing', f)}
                    options={[
                      { value: 'crop', label: t('Cortar') },
                      { value: 'blur', label: t('Desfocado') },
                      { value: 'bars', label: t('Barras') }
                    ]}
                  />
                </Field>
                {s.framing === 'crop' && (
                  <>
                    <Range label={t('Posição do corte')} value={s.position} min={0} max={100} onChange={(v) => set('position', v)} format={(v) => (v < 40 ? t('esquerda') : v > 60 ? t('direita') : t('centro'))} />
                    <Range label={t('Zoom')} value={s.zoom || 1} min={1} max={3} step={0.05} onChange={(v) => set('zoom', v)} format={(v) => `${v.toFixed(1)}x`} />
                  </>
                )}
                {s.framing === 'blur' && <Range label={t('Força do desfoque')} value={s.blur} min={2} max={60} onChange={(v) => set('blur', v)} />}
                {s.framing === 'bars' && (
                  <Field label={t('Cor das barras')}>
                    <input type="color" value={s.barColor} onChange={(ev) => set('barColor', ev.target.value)} className="h-11 w-20 rounded-xl border border-line bg-panel-2" />
                  </Field>
                )}
              </>
            )}
          </Section>

          <Section title={t('Movimento / FPS')} icon={<Gauge className="h-5 w-5" />} badge={s.fps || s.speed !== 1 ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}>
            <Field label={<>{t('FPS final')} <Tip>{t('Quantas imagens por segundo. 60 deixa o movimento mais liso, mas só fica mais suave de verdade se criar quadros novos com a IA.')}</Tip></>}>
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                {[0, 24, 30, 60].map((f) => (
                  <Chip key={f} active={s.fps === f} onClick={() => set('fps', f)}>
                    {f === 0 ? t('Manter') : `${f} fps`}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label={t('Quadros novos')}>
              <Segmented<FrameMethod>
                value={aiFramesOn ? 'ai' : 'duplicate'}
                onChange={(m) => set('method', m)}
                options={[
                  { value: 'duplicate', label: t('Duplicar') },
                  { value: 'ai', label: <><Sparkles className="h-4 w-4 text-warn" />IA (RIFE)</>, disabled: !vulkan }
                ]}
              />
            </Field>
            {aiFramesOn && <PackInline id="rife" vulkan={vulkan} />}
            {aiFramesOn && rife.installed && <p className="text-[13px] text-warn">{t('No celular a IA é lenta: conte alguns minutos para cada 10 s de vídeo.')}</p>}
            <Field label={t('Velocidade')}>
              <div className="no-scrollbar flex gap-2 overflow-x-auto">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => (
                  <Chip key={v} active={s.speed === v} onClick={() => set('speed', v)}>
                    {v === 1 ? t('Normal') : `${v}x`}
                  </Chip>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Início')}>
                <TextInput value={s.start} placeholder="0:00" onChange={(ev) => set('start', ev.target.value)} inputMode="decimal" />
              </Field>
              <Field label={t('Fim')}>
                <TextInput value={s.end} placeholder={t('até o fim')} onChange={(ev) => set('end', ev.target.value)} inputMode="decimal" />
              </Field>
            </div>
          </Section>

          <Section title={t('Imagem')} icon={<ImageIcon className="h-5 w-5" />} badge={e.upscaler !== 'none' || e.sharpen || e.saturation || e.contrast || e.brightness ? <span className="h-2 w-2 rounded-full bg-warn" /> : null}>
            <Toggle
              checked={e.upscaler !== 'none'}
              onChange={(v) => setS((c) => ({ ...c, enhance: { ...enhanceOf(c), upscaler: v ? 'esrgan' : 'none', esrganModel: 'realesr-animevideov3', upScale: 2 } }))}
              label={<span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-warn" />{t('Melhorar imagem com IA')}</span>}
              hint={t('Real-ESRGAN: dobra a resolução redesenhando os detalhes.')}
            />
            {e.upscaler !== 'none' && <PackInline id="esrgan" vulkan={vulkan} />}
            {e.upscaler !== 'none' && esrgan.installed && <p className="text-[13px] text-warn">{t('No celular a IA é lenta: conte alguns minutos para cada 10 s de vídeo.')}</p>}
            <Range label={t('Nitidez')} value={e.sharpen} min={0} max={10} onChange={(v) => setS((c) => ({ ...c, enhance: { ...enhanceOf(c), sharpen: v } }))} />
            <Range label={t('Brilho')} value={e.brightness} min={-50} max={50} step={5} onChange={(v) => setS((c) => ({ ...c, enhance: { ...enhanceOf(c), brightness: v } }))} />
            <Range label={t('Contraste')} value={e.contrast} min={-50} max={50} step={5} onChange={(v) => setS((c) => ({ ...c, enhance: { ...enhanceOf(c), contrast: v } }))} />
            <Range label={t('Saturação')} value={e.saturation} min={-50} max={50} step={5} onChange={(v) => setS((c) => ({ ...c, enhance: { ...enhanceOf(c), saturation: v } }))} />
          </Section>

          <Section title={t('Texto')} icon={<Type className="h-5 w-5" />} badge={o.text.trim() ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}>
            <TextInput value={o.text} placeholder={t('ex.: @seuperfil')} onChange={(ev) => setS((c) => ({ ...c, overlay: { ...overlayOf(c), text: ev.target.value } }))} />
            {o.text.trim() && (
              <>
                <Field label={t('Posição')}>
                  <Select value={o.textPos} onChange={(ev) => setS((c) => ({ ...c, overlay: { ...overlayOf(c), textPos: ev.target.value as ScreenPos } }))}>
                    {SCREEN_POS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {t(p.label)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Range label={t('Tamanho')} value={o.textSize} min={2} max={12} step={0.5} format={(v) => `${v}%`} onChange={(v) => setS((c) => ({ ...c, overlay: { ...overlayOf(c), textSize: v } }))} />
                <Toggle checked={o.textBox} onChange={(v) => setS((c) => ({ ...c, overlay: { ...overlayOf(c), textBox: v } }))} label={t('Faixa escura atrás do texto')} />
              </>
            )}
          </Section>

          <Section title={t('Arquivo')} icon={<FileVideo className="h-5 w-5" />}>
            <Range label={<>{t('Qualidade')} <Tip>{t('Menor = melhor e arquivo maior. 18 a 20 já parece igual ao original.')}</Tip></>} value={s.quality} min={14} max={32} onChange={(v) => set('quality', v)} />
            <Field label={<>{t('Formato do vídeo')} <Tip>{t('H.264 abre em qualquer lugar. H.265 deixa o arquivo menor, mas alguns aparelhos antigos não abrem.')}</Tip></>}>
              <Segmented<string>
                value={s.encoder || 'libx264'}
                onChange={(v) => set('encoder', v)}
                options={[
                  { value: 'libx264', label: 'H.264' },
                  { value: 'libx265', label: 'H.265' }
                ]}
              />
            </Field>
            <Toggle checked={s.audio} onChange={(v) => set('audio', v)} label={t('Manter o áudio')} />
          </Section>
        </>
      )}

      {file && (
        <div className="fixed inset-x-0 bottom-[68px] z-10 bg-gradient-to-t from-bg via-bg/95 to-transparent px-4 pt-6 pb-3">
          <Button variant="primary" size="lg" className="w-full" icon={<Wand2 className="h-5 w-5" />} disabled={!info} onClick={run}>
            {t('Preparar vídeo')}
          </Button>
        </div>
      )}
    </div>
  )
}
