import { useState, type ReactNode } from 'react'
import { CircleCheck, CircleX, FolderOpen, RefreshCw, TriangleAlert } from 'lucide-react'
import type { JsRuntimeChoice } from '../../../shared/types'
import { LANGS, type Lang } from '../../../shared/i18n'
import type { AppContext } from '../App'
import { Badge, Button, Card, Field, Select, Spinner, TextInput, Toggle } from '../components/ui'
import { t } from '../../../shared/i18n'

function Status({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${ok ? 'text-ok' : 'text-err'}`}>
      {ok ? <CircleCheck className="h-4 w-4" /> : <CircleX className="h-4 w-4" />}
      {children}
    </div>
  )
}

function PathField({
  label,
  value,
  placeholder,
  onSave,
  pick
}: {
  label: string
  value: string
  placeholder: string
  onSave: (v: string) => void
  pick: () => Promise<string | null>
}) {
  const [text, setText] = useState(value)
  return (
    <Field label={label} hint={t('Vazio = procurar automaticamente (pasta do app, pasta acima do projeto e PATH).')}>
      <div className="flex gap-2">
        <TextInput value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={() => text !== value && onSave(text.trim())} />
        <Button
          icon={<FolderOpen className="h-4 w-4" />}
          onClick={async () => {
            const p = await pick()
            if (p) {
              setText(p)
              onSave(p)
            }
          }}
        >
          {t('Procurar')}
        </Button>
      </div>
    </Field>
  )
}

export default function SettingsPage({ ctx }: { ctx: AppContext }) {
  const { settings: s, tools: tl } = ctx
  const [channel, setChannel] = useState('stable')
  const [updating, setUpdating] = useState(false)
  const [updateOut, setUpdateOut] = useState<string | null>(null)
  const [template, setTemplate] = useState(s.outputTemplate)
  const [checking, setChecking] = useState(false)
  const [checkMsg, setCheckMsg] = useState<string | null>(null)

  const update = async () => {
    setUpdating(true)
    setUpdateOut(null)
    const r = await window.api.updateYtdlp(channel)
    setUpdateOut(r.output)
    setUpdating(false)
    await ctx.refreshTools()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[900px] space-y-5 p-6">
        <div className="flex items-center gap-4">
          <h1 className="flex-1 text-xl font-semibold">{t('Configurações')}</h1>
          <Button icon={<RefreshCw className="h-4 w-4" />} onClick={ctx.refreshTools}>
            {t('Verificar programas de novo')}
          </Button>
        </div>

        <Card title={t('Idioma (Language)')}>
          <Field label={t('Idioma do app')}>
            <Select value={s.language} onChange={(e) => ctx.saveSettings({ language: e.target.value as Lang })}>
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <Card title="yt-dlp">
          <div className="space-y-4">
            <Status ok={!!tl.ytdlp.path}>
              {tl.ytdlp.path ? (
                <>
                  {t('Versão ')}{tl.ytdlp.version} · <span className="text-muted">{tl.ytdlp.path}</span>
                </>
              ) : (
                t('yt-dlp.exe não encontrado')
              )}
            </Status>
            <PathField
              label={t('Caminho do yt-dlp.exe')}
              value={s.ytdlpPath}
              placeholder={tl.ytdlp.path ?? 'C:\\caminho\\yt-dlp.exe'}
              onSave={(v) => ctx.saveSettings({ ytdlpPath: v })}
              pick={() => window.api.pickFile(s.ytdlpPath, 'yt-dlp', ['exe'])}
            />
            <div className="flex items-end gap-3">
              <div className="w-56">
                <Field label={t('Canal de atualização')}>
                  <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                    <option value="stable">{t('Estável (recomendado)')}</option>
                    <option value="nightly">{t('Nightly (diário)')}</option>
                    <option value="master">{t('Master (a cada commit)')}</option>
                  </Select>
                </Field>
              </div>
              <Button variant="primary" disabled={!tl.ytdlp.path || updating} icon={updating ? <Spinner /> : <RefreshCw className="h-4 w-4" />} onClick={update}>
                {updating ? t('Atualizando…') : t('Atualizar yt-dlp')}
              </Button>
            </div>
            <p className="text-xs text-muted">{t('Sites como o YouTube mudam com frequência. Se um download parar de funcionar, atualizar costuma resolver.')}</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Toggle
                  checked={s.checkUpdates}
                  onChange={(v) => ctx.saveSettings({ checkUpdates: v })}
                  label={t('Avisar quando sair versão nova')}
                  hint={t('Ao abrir o app, consulta o GitHub do yt-dlp e mostra um aviso no menu lateral.')}
                />
              </div>
              <Button
                size="sm"
                disabled={checking}
                icon={checking ? <Spinner /> : null}
                onClick={async () => {
                  setChecking(true)
                  const r = await window.api.checkYtdlpUpdate()
                  setChecking(false)
                  setCheckMsg(r.error ? t('Não consegui consultar: {error}', { error: r.error }) : r.newer ? t('Versão nova: {latest} (você tem {current})', { latest: r.latest ?? '', current: r.current ?? '' }) : t('Você está na mais nova ({current})', { current: r.current ?? '' }))
                }}
              >
                {t('Verificar agora')}
              </Button>
            </div>
            {checkMsg && <p className="text-xs text-info">{checkMsg}</p>}
            {updateOut && <pre className="selectable max-h-48 overflow-auto rounded-lg bg-bg p-3 font-mono text-xs whitespace-pre-wrap text-muted">{updateOut}</pre>}
          </div>
        </Card>

        <Card title="FFmpeg">
          <div className="space-y-4">
            <Status ok={!!tl.ffmpeg.path}>
              {tl.ffmpeg.path ? (
                <>
                  ffmpeg {tl.ffmpeg.version} · <span className="text-muted">{tl.ffmpeg.path}</span>
                </>
              ) : (
                t('ffmpeg.exe não encontrado: sem ele não dá para juntar vídeo e áudio nem converter')
              )}
            </Status>
            <Status ok={!!tl.ffprobe.path}>
              {tl.ffprobe.path ? (
                <>
                  {t('ffprobe · ')}<span className="text-muted">{tl.ffprobe.path}</span>
                </>
              ) : (
                t('ffprobe.exe não encontrado')
              )}
            </Status>
            {!tl.ffprobe.path && (
              <div className="flex gap-2 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  {t('Sem o ffprobe, “embutir miniatura” e algumas correções dão erro. Ele vem no mesmo pacote do ffmpeg (build “essentials” da gyan.dev, pasta')}
                  <code> bin</code>{t('). Coloque o ')}<code>ffprobe.exe</code>{t(' ao lado do ')}<code>ffmpeg.exe</code>{t(' e clique em “Verificar programas de novo”.')}
                </div>
              </div>
            )}
            <PathField
              label={t('Caminho do ffmpeg.exe')}
              value={s.ffmpegPath}
              placeholder={tl.ffmpeg.path ?? 'C:\\caminho\\ffmpeg.exe'}
              onSave={(v) => ctx.saveSettings({ ffmpegPath: v })}
              pick={() => window.api.pickFile(s.ffmpegPath, 'ffmpeg', ['exe'])}
            />
          </div>
        </Card>

        <Card title={t('Runtime JavaScript (necessário para o YouTube)')}>
          <div className="space-y-4">
            <Status ok={!!tl.jsRuntime}>
              {tl.jsRuntime ? (
                <>
                  {t('Usando ')}{tl.jsRuntime.name} · <span className="text-muted">{tl.jsRuntime.path}</span>
                </>
              ) : (
                t('Nenhum runtime: o YouTube pode esconder formatos ou falhar')
              )}
            </Status>
            <p className="text-xs text-muted">
              {t('O YouTube exige resolver um desafio em JavaScript. O yt-dlp procura o Deno sozinho; com o Node, o app passa ')}<code>--js-runtimes node</code>.
            </p>
            <div className="grid grid-cols-[220px_1fr] gap-3">
              <Field label={t('Qual usar')}>
                <Select value={s.jsRuntime} onChange={(e) => ctx.saveSettings({ jsRuntime: e.target.value as JsRuntimeChoice })}>
                  <option value="auto">{t('Automático (Deno, depois Node)')}</option>
                  <option value="deno">Deno</option>
                  <option value="node">Node.js</option>
                  <option value="none">{t('Nenhum')}</option>
                </Select>
              </Field>
              <PathField
                label={t('Caminho do executável (opcional)')}
                value={s.jsRuntimePath}
                placeholder={tl.jsRuntime?.path ?? 'C:\\caminho\\node.exe'}
                onSave={(v) => ctx.saveSettings({ jsRuntimePath: v })}
                pick={() => window.api.pickFile(s.jsRuntimePath, 'Runtime', ['exe'])}
              />
            </div>
          </div>
        </Card>

        <Card title={t('Criação de quadros (FPS)')}>
          <div className="space-y-4">
            <Status ok={!!ctx.caps?.frcAmf}>
              {ctx.caps?.frcAmf ? t('Placa AMD (frc_amf) disponível') : t('Placa AMD (frc_amf) indisponível nesta máquina')}
            </Status>
            <Status ok={tl.rife.models.length > 0}>
              {tl.rife.models.length ? t('IA (RIFE) com {n} modelos', { n: tl.rife.models.length }) : t('IA (RIFE) não encontrada: a opção “IA” fica desligada')}
            </Status>
            {[...new Set(Object.values(tl.rife.info).map((m) => m.exe))].map((exe) => {
              const models = tl.rife.models.filter((id) => tl.rife.info[id].exe === exe)
              const engine = tl.rife.info[models[0]]?.engine
              return (
                <details key={exe} className="rounded-lg bg-panel-2 px-3 py-2 text-sm">
                  <summary className="cursor-pointer">
                    {engine ? t('Instalação “{name}”', { name: engine }) : t('Instalação principal')} · {models.length}{t(' modelos · ')}<span className="text-muted">{exe}</span>
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {models.map((m) => (
                      <Badge key={m}>{m.replace(/^[^/]+\//, '')}</Badge>
                    ))}
                  </div>
                </details>
              )
            })}
            <PathField
              label={t('Caminho do rife-ncnn-vulkan.exe')}
              value={s.rifePath}
              placeholder={tl.rife.path ?? 'D:\\yt-dlp\\rife\\rife-ncnn-vulkan.exe'}
              onSave={(v) => ctx.saveSettings({ rifePath: v })}
              pick={() => window.api.pickFile(s.rifePath, 'RIFE', ['exe'])}
            />
            <p className="text-xs text-muted">
              {t('Para usar mais modelos, coloque a pasta de cada um (com ')}<code>flownet.param</code>{t(' e ')}<code>flownet.bin</code>{t(') ao lado de um')}{' '}
              <code>rife-ncnn-vulkan.exe</code>{t('. Outra instalação inteira também vale: uma pasta ')}<code>{t('rife-alguma-coisa')}</code>{t(' ao lado da pasta')}{' '}
              <code>rife</code>{t('. Depois clique em “Verificar programas de novo”.')}
            </p>
          </div>
        </Card>

        <Card title={t('Downloads')}>
          <div className="space-y-4">
            <Field label={t('Pasta de destino')}>
              <div className="flex gap-2">
                <TextInput value={s.downloadDir} readOnly />
                <Button
                  icon={<FolderOpen className="h-4 w-4" />}
                  onClick={async () => {
                    const d = await window.api.pickFolder(s.downloadDir)
                    if (d) await ctx.saveSettings({ downloadDir: d })
                  }}
                >
                  {t('Escolher')}
                </Button>
              </div>
            </Field>
            <Field
              label={t('Modelo do nome do arquivo')}
              hint={
                <>
                  {t('Campos do yt-dlp entre ')}<code>%(…)s</code>{t('. Ex.: ')}<code>%(uploader)s/%(title)s.%(ext)s</code>{t(' cria uma pasta por canal;')}{' '}
                  <code>%(playlist_index)03d - %(title)s.%(ext)s</code>{t(' numera os itens da playlist.')}
                </>
              }
            >
              <TextInput
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                onBlur={() => template.trim() && ctx.saveSettings({ outputTemplate: template.trim() })}
                className="font-mono text-xs"
              />
            </Field>
            <div className="w-56">
              <Field label={t('Downloads ao mesmo tempo')}>
                <Select value={s.concurrency} onChange={(e) => ctx.saveSettings({ concurrency: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
