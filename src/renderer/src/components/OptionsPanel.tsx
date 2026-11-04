/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Copy, Download, FolderOpen, SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { Button, Checkbox, Field, MaxQualityButton, Segmented, Select, TextInput, Toggle, cx } from './ui'
import { AUDIO_FORMATS, SPONSOR_CATEGORIES, formatKind, quoteArg, type DownloadOptions, type Mode } from '../lib/args'
import type { AppContext } from '../App'
import ExportForm, { ENCODER_LABEL } from './ExportForm'
import { t } from '../../../shared/i18n'

function Group({ title, children, defaultOpen = true, badge }: { title: string; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-line">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-semibold hover:bg-panel-2">
        <span className="flex-1">{title}</span>
        {badge}
        <ChevronDown className={cx('h-4 w-4 text-muted transition-transform', !open && '-rotate-90')} />
      </button>
      {open && <div className="space-y-3 px-5 pb-4">{children}</div>}
    </div>
  )
}

export default function OptionsPanel({
  ctx,
  info,
  isPlaylist,
  opts,
  setOpts,
  encoders,
  advancedCount,
  onOpenAll,
  args,
  url,
  action
}: {
  ctx: AppContext
  info: any | null
  isPlaylist: boolean
  opts: DownloadOptions
  setOpts: (fn: (o: DownloadOptions) => DownloadOptions) => void
  encoders: string[]
  advancedCount: number
  onOpenAll: () => void
  args: string[]
  url: string
  action: { label: string; disabled: boolean; run: () => void }
}) {
  // Opções de antes de ligar a Qualidade máxima, para desligar e voltar a elas
  const beforeBest = useRef<Partial<DownloadOptions> | null>(null)
  const [template, setTemplate] = useState(ctx.settings.outputTemplate)
  const [showCmd, setShowCmd] = useState(false)
  const set = <K extends keyof DownloadOptions>(k: K, v: DownloadOptions[K]) => setOpts((o) => ({ ...o, [k]: v }))

  const heights = useMemo(() => {
    const hs = new Set<number>()
    for (const f of info?.formats ?? []) if (f.height && (formatKind(f) === 'v' || formatKind(f) === 'av')) hs.add(f.height)
    const list = [...hs].sort((a, b) => b - a)
    return list.length ? list : [4320, 2160, 1440, 1080, 720, 480, 360, 240, 144]
  }, [info])

  const hasManual = !!(opts.manualVideo || opts.manualAudio.length)
  const subsCount = new Set([...opts.subsManual, ...opts.subsAuto]).size
  const noProbe = !ctx.tools.ffprobe.path
  const command = ['yt-dlp', '-P', ctx.settings.downloadDir, '-o', ctx.settings.outputTemplate, ...args, url || '<link>']
    .map(quoteArg)
    .join(' ')

  return (
    <aside className="flex h-full w-[392px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <SlidersHorizontal className="h-4 w-4 text-muted" />
        <h2 className="text-[15px] font-semibold">{t('Opções de download')}</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Group title={t('O que baixar')}>
          {(() => {
            // Qualidade máxima: o maior tamanho e FPS que o site tiver, qualquer codec, melhor áudio e nada de converter
            const isBest = opts.maxHeight === 0 && opts.maxFps === 0 && opts.vcodec === '' && !opts.convertH264 && (opts.mode === 'audio' ? opts.audioFormat === 'best' && opts.audioQuality === '0' : opts.mode === 'video')
            const toggle = () => {
              if (!isBest) {
                const { mode, maxHeight, maxFps, vcodec, convertH264, audioFormat, audioQuality } = opts
                beforeBest.current = { mode, maxHeight, maxFps, vcodec, convertH264, audioFormat, audioQuality }
                return setOpts((o) => ({ ...o, mode: o.mode === 'audio' ? 'audio' : 'video', maxHeight: 0, maxFps: 0, vcodec: '', convertH264: false, audioFormat: 'best', audioQuality: '0' }))
              }
              // Desligar: volta ao que estava antes; sem isso, a 1080p
              const back = beforeBest.current ?? (opts.mode === 'audio' ? { audioFormat: 'mp3' } : { maxHeight: 1080 })
              beforeBest.current = null
              setOpts((o) => ({ ...o, ...back }))
            }
            return (
              <MaxQualityButton
                active={isBest}
                onClick={toggle}
                detail={t('O maior tamanho e FPS do site, o melhor áudio e nenhuma conversão. Players antigos podem não abrir AV1 ou VP9.')}
                warning={t('Pode aumentar drasticamente o tamanho do arquivo e o tempo de download.')}
              />
            )
          })()}
          <Segmented<Mode>
            value={opts.mode}
            onChange={(m) => set('mode', m)}
            options={[
              { value: 'video', label: t('Vídeo') },
              { value: 'audio', label: t('Só áudio') },
              { value: 'manual', label: t('Escolhidos'), disabled: isPlaylist || !hasManual }
            ]}
          />
          {opts.mode === 'video' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Qualidade máxima')}>
                <Select value={opts.maxHeight} onChange={(e) => set('maxHeight', Number(e.target.value))}>
                  <option value={0}>{t('A melhor disponível')}</option>
                  {heights.map((h) => (
                    <option key={h} value={h}>
                      {h >= 2160 ? `${h}p (${h >= 4320 ? '8K' : '4K'})` : h === 1440 ? '1440p (2K)' : `${h}p`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('Codec preferido')}>
                <Select value={opts.vcodec} onChange={(e) => set('vcodec', e.target.value)}>
                  <option value="">{t('Automático')}</option>
                  <option value="h264">{t('H.264 (mais compatível)')}</option>
                  <option value="h265">H.265 / HEVC</option>
                  <option value="vp9">VP9</option>
                  <option value="av01">{t('AV1 (menor arquivo)')}</option>
                </Select>
              </Field>
              <Field label={t('FPS máximo')}>
                <Select value={opts.maxFps} onChange={(e) => set('maxFps', Number(e.target.value))}>
                  <option value={0}>{t('O maior disponível')}</option>
                  {[60, 50, 30, 25, 24].map((f) => (
                    <option key={f} value={f}>
                      {t('Até ')}{f} fps
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          {opts.mode === 'audio' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Formato')}>
                <Select value={opts.audioFormat} onChange={(e) => set('audioFormat', e.target.value)}>
                  {AUDIO_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f === 'best' ? t('Original (sem converter)') : f.toUpperCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('Qualidade')}>
                <Select value={opts.audioQuality} onChange={(e) => set('audioQuality', e.target.value)}>
                  <option value="0">{t('Máxima (VBR 0)')}</option>
                  <option value="2">{t('Alta (VBR 2)')}</option>
                  <option value="5">{t('Média (VBR 5)')}</option>
                  <option value="320K">320 kbps</option>
                  <option value="256K">256 kbps</option>
                  <option value="192K">192 kbps</option>
                  <option value="128K">128 kbps</option>
                  <option value="96K">96 kbps</option>
                </Select>
              </Field>
            </div>
          )}
          {opts.mode === 'manual' && (
            <div className="rounded-lg bg-panel-2 p-3 text-sm">
              {t('Formatos: ')}<code className="text-accent">{[opts.manualVideo, ...opts.manualAudio].filter(Boolean).join(' + ')}</code>
              <div className="mt-1 text-xs text-muted">{t('Escolhidos na aba Formatos.')}{opts.manualAudio.length > 1 && t(' Várias faixas de áudio no mesmo arquivo.')}</div>
            </div>
          )}
          {opts.mode !== 'audio' && (
            <Field label={t('Contêiner do arquivo')}>
              <Select value={opts.container} onChange={(e) => set('container', e.target.value)}>
                <option value="">{t('Automático (o que vier)')}</option>
                <option value="mp4">MP4</option>
                <option value="mkv">MKV</option>
                <option value="webm">WebM</option>
                <option value="mov">MOV</option>
              </Select>
            </Field>
          )}
          {isPlaylist && (
            <p className="text-xs text-muted">{t('Na playlist, a qualidade vale para cada vídeo. Escolha formatos exatos abrindo os detalhes de um vídeo.')}</p>
          )}
        </Group>

        {opts.mode !== 'audio' && (
          <Group title={t('Converter para H.264')} defaultOpen={opts.convertH264} badge={opts.convertH264 ? <span className="text-xs text-accent">{t('ligado')}</span> : null}>
            <Toggle
              checked={opts.convertH264}
              onChange={(v) => set('convertH264', v)}
              label={t('Converter depois de baixar')}
              hint={t('Para abrir em qualquer player, editor ou TV. O YouTube só oferece H.264 até 1080p.')}
              disabled={!encoders.length}
            />
            {opts.convertH264 && (
              <>
                <Field label={t('Codificador')}>
                  <Select value={opts.convertEncoder || encoders[0]} onChange={(e) => set('convertEncoder', e.target.value)}>
                    {encoders.map((e) => (
                      <option key={e} value={e}>
                        {t(ENCODER_LABEL[e] ?? e)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Toggle checked={opts.convertKeep} onChange={(v) => set('convertKeep', v)} label={t('Manter o arquivo original também')} />
              </>
            )}
          </Group>
        )}

        <Group title={t('Legendas')} defaultOpen={subsCount > 0} badge={subsCount ? <span className="text-xs text-accent">{subsCount}</span> : null}>
          {subsCount ? (
            <>
              <div className="text-sm">
                {[...opts.subsManual, ...opts.subsAuto.map((s) => `${s} (auto)`)].join(', ')}
              </div>
              <Field label={t('Formato')}>
                <Select value={opts.subFormat} onChange={(e) => set('subFormat', e.target.value)}>
                  <option value="">{t('Original')}</option>
                  <option value="srt">SRT</option>
                  <option value="vtt">VTT</option>
                  <option value="ass">ASS</option>
                  <option value="lrc">LRC</option>
                </Select>
              </Field>
              {opts.mode !== 'audio' && (
                <Toggle checked={opts.embedSubs} onChange={(v) => set('embedSubs', v)} label={t('Embutir no vídeo')} hint={t('Desligado: salva como arquivo separado ao lado do vídeo.')} />
              )}
            </>
          ) : (
            <p className="text-sm text-muted">{info ? t('Nenhuma escolhida. Marque idiomas na aba Legendas.') : t('Analise um link para escolher idiomas.')}</p>
          )}
        </Group>

        <Group title={t('Miniatura, metadados e extras')} defaultOpen={false}>
          <Toggle checked={opts.embedThumb} onChange={(v) => set('embedThumb', v)} label={t('Embutir miniatura no arquivo')} hint={t('Vira a capa no player (--embed-thumbnail).')} />
          {opts.embedThumb && noProbe && (
            <div className="flex gap-2 rounded-lg bg-warn/10 p-2.5 text-xs text-warn">
              <TriangleAlert className="h-4 w-4 shrink-0" />{t(' Precisa do ffprobe.exe ao lado do ffmpeg.exe. Veja Configurações.')}
            </div>
          )}
          <Toggle checked={opts.writeThumb} onChange={(v) => set('writeThumb', v)} label={t('Salvar miniatura como imagem')} />
          <Toggle checked={opts.allThumbs} onChange={(v) => set('allThumbs', v)} label={t('Salvar todas as miniaturas')} hint={t('Todas as resoluções disponíveis.')} />
          {(opts.writeThumb || opts.allThumbs || opts.embedThumb) && (
            <Field label={t('Formato da miniatura')}>
              <Select value={opts.thumbFormat} onChange={(e) => set('thumbFormat', e.target.value)}>
                <option value="">{t('Original')}</option>
                <option value="jpg">JPG</option>
                <option value="png">PNG</option>
                <option value="webp">WebP</option>
              </Select>
            </Field>
          )}
          <Toggle checked={opts.embedMeta} onChange={(v) => set('embedMeta', v)} label={t('Embutir metadados')} hint={t('Título, canal, data, descrição.')} />
          <Toggle checked={opts.embedChapters} onChange={(v) => set('embedChapters', v)} label={t('Embutir capítulos')} />
          <Toggle checked={opts.splitChapters} onChange={(v) => set('splitChapters', v)} label={t('Dividir em um arquivo por capítulo')} />
          <Toggle checked={opts.writeDescription} onChange={(v) => set('writeDescription', v)} label={t('Salvar descrição (.description)')} />
          <Toggle checked={opts.writeInfoJson} onChange={(v) => set('writeInfoJson', v)} label={t('Salvar todas as informações (.info.json)')} />
          <Toggle checked={opts.writeComments} onChange={(v) => set('writeComments', v)} label={t('Salvar comentários')} hint={t('Vão dentro do .info.json. Pode demorar.')} />
          <Toggle checked={opts.keepFiles} onChange={(v) => set('keepFiles', v)} label={t('Manter arquivos intermediários')} hint={t('Guarda o vídeo e o áudio separados depois de juntar (-k).')} />
        </Group>

        <Group title="SponsorBlock" defaultOpen={false} badge={opts.sponsorMode !== 'off' ? <span className="text-xs text-accent">{t('ligado')}</span> : null}>
          <Segmented
            value={opts.sponsorMode}
            onChange={(v) => set('sponsorMode', v)}
            options={[
              { value: 'off', label: t('Desligado') },
              { value: 'mark', label: t('Marcar') },
              { value: 'remove', label: t('Cortar') }
            ]}
          />
          <p className="text-xs text-muted">{t('Marcar cria capítulos nos trechos. Cortar remove os trechos do arquivo.')}</p>
          {opts.sponsorMode !== 'off' && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {SPONSOR_CATEGORIES.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={opts.sponsorCats.includes(c.id)}
                    onChange={(v) => set('sponsorCats', v ? [...opts.sponsorCats, c.id] : opts.sponsorCats.filter((x) => x !== c.id))}
                  />
                  {t(c.label)}
                </label>
              ))}
            </div>
          )}
        </Group>

        <Group title={t('Onde salvar')}>
          <Field label={t('Pasta')}>
            <div className="flex gap-2">
              <TextInput value={ctx.settings.downloadDir} readOnly title={ctx.settings.downloadDir} />
              <Button
                icon={<FolderOpen className="h-4 w-4" />}
                onClick={async () => {
                  const dir = await window.api.pickFolder(ctx.settings.downloadDir)
                  if (dir) await ctx.saveSettings({ downloadDir: dir })
                }}
              />
            </div>
          </Field>
          <Field label={t('Nome do arquivo')} hint={t('%(title)s título · %(id)s id · %(uploader)s canal · %(upload_date)s data · %(ext)s extensão')}>
            <TextInput
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              onBlur={() => template.trim() && template !== ctx.settings.outputTemplate && ctx.saveSettings({ outputTemplate: template.trim() })}
              className="font-mono text-xs"
            />
          </Field>
        </Group>

        <Group title={t('Avançado')} defaultOpen={advancedCount > 0 || !!opts.extraArgs || opts.presets.length > 0}>
          <Button className="w-full" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={onOpenAll}>
            {t('Todas as opções do yt-dlp')}
            {advancedCount > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] text-white">{advancedCount}</span>}
          </Button>
          <Field label={t('Argumentos extras')} hint={t('Escreva como no terminal. Vão por último e têm prioridade.')}>
            <TextInput value={opts.extraArgs} onChange={(e) => set('extraArgs', e.target.value)} placeholder="--limit-rate 5M --cookies-from-browser firefox" className="font-mono text-xs" />
          </Field>
          <div>
            <button className="flex items-center gap-1 text-xs font-medium text-info hover:underline" onClick={() => setShowCmd(!showCmd)}>
              <ChevronDown className={cx('h-3.5 w-3.5 transition-transform', !showCmd && '-rotate-90')} />
              {t('Ver o comando que será executado')}
            </button>
            {showCmd && (
              <div className="mt-2 space-y-2">
                <pre className="max-h-48 overflow-auto rounded-lg bg-bg p-3 font-mono text-[11px] leading-4 whitespace-pre-wrap break-all text-muted">{command}</pre>
                <Button size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => window.api.writeClipboard(command)}>
                  {t('Copiar comando')}
                </Button>
              </div>
            )}
          </div>
        </Group>

        {opts.mode !== 'audio' && (
          <Group
            title={t('Preparar para postar')}
            defaultOpen={opts.exportOn}
            badge={opts.exportOn ? <span className="text-xs text-accent">{t(opts.exportSettings.name)}</span> : null}
          >
            <Toggle
              checked={opts.exportOn}
              onChange={(v) => set('exportOn', v)}
              label={t('Preparar depois de baixar')}
              hint={t('Gera mais um arquivo pronto para a rede escolhida. O original continua na pasta.')}
            />
            {opts.exportOn && (
              <ExportForm
                value={opts.exportSettings}
                onChange={(s) => set('exportSettings', s)}
                caps={ctx.caps}
                rifeModels={ctx.tools.rife.models}
                source={info?.width && info?.height ? { width: info.width, height: info.height, fps: info.fps ?? null, duration: info.duration ?? null } : null}
                saved={ctx.settings.exportPresets}
                onSavePreset={ctx.savePreset}
                onDeletePreset={ctx.deletePreset}
                upscalers={ctx.tools.upscalers}
                tools={ctx.tools}
              />
            )}
          </Group>
        )}
      </div>

      <div className="border-t border-line p-4">
        <Button variant="primary" size="lg" className="w-full" icon={<Download className="h-5 w-5" />} disabled={action.disabled} onClick={action.run}>
          {action.label}
        </Button>
      </div>
    </aside>
  )
}
