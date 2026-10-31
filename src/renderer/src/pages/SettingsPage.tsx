import { useState, type ReactNode } from 'react'
import { CircleCheck, CircleX, FolderOpen, RefreshCw, TriangleAlert } from 'lucide-react'
import type { JsRuntimeChoice } from '../../../shared/types'
import type { AppContext } from '../App'
import { Badge, Button, Card, Field, Select, Spinner, TextInput, Toggle } from '../components/ui'

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
    <Field label={label} hint="Vazio = procurar automaticamente (pasta do app, pasta acima do projeto e PATH).">
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
          Procurar
        </Button>
      </div>
    </Field>
  )
}

export default function SettingsPage({ ctx }: { ctx: AppContext }) {
  const { settings: s, tools: t } = ctx
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
          <h1 className="flex-1 text-xl font-semibold">Configurações</h1>
          <Button icon={<RefreshCw className="h-4 w-4" />} onClick={ctx.refreshTools}>
            Verificar programas de novo
          </Button>
        </div>

        <Card title="yt-dlp">
          <div className="space-y-4">
            <Status ok={!!t.ytdlp.path}>
              {t.ytdlp.path ? (
                <>
                  Versão {t.ytdlp.version} · <span className="text-muted">{t.ytdlp.path}</span>
                </>
              ) : (
                'yt-dlp.exe não encontrado'
              )}
            </Status>
            <PathField
              label="Caminho do yt-dlp.exe"
              value={s.ytdlpPath}
              placeholder={t.ytdlp.path ?? 'C:\\caminho\\yt-dlp.exe'}
              onSave={(v) => ctx.saveSettings({ ytdlpPath: v })}
              pick={() => window.api.pickFile(s.ytdlpPath, 'yt-dlp', ['exe'])}
            />
            <div className="flex items-end gap-3">
              <div className="w-56">
                <Field label="Canal de atualização">
                  <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                    <option value="stable">Estável (recomendado)</option>
                    <option value="nightly">Nightly (diário)</option>
                    <option value="master">Master (a cada commit)</option>
                  </Select>
                </Field>
              </div>
              <Button variant="primary" disabled={!t.ytdlp.path || updating} icon={updating ? <Spinner /> : <RefreshCw className="h-4 w-4" />} onClick={update}>
                {updating ? 'Atualizando…' : 'Atualizar yt-dlp'}
              </Button>
            </div>
            <p className="text-xs text-muted">Sites como o YouTube mudam com frequência. Se um download parar de funcionar, atualizar costuma resolver.</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Toggle
                  checked={s.checkUpdates}
                  onChange={(v) => ctx.saveSettings({ checkUpdates: v })}
                  label="Avisar quando sair versão nova"
                  hint="Ao abrir o app, consulta o GitHub do yt-dlp e mostra um aviso no menu lateral."
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
                  setCheckMsg(r.error ? `Não consegui consultar: ${r.error}` : r.newer ? `Versão nova: ${r.latest} (você tem ${r.current})` : `Você está na mais nova (${r.current})`)
                }}
              >
                Verificar agora
              </Button>
            </div>
            {checkMsg && <p className="text-xs text-info">{checkMsg}</p>}
            {updateOut && <pre className="selectable max-h-48 overflow-auto rounded-lg bg-bg p-3 font-mono text-xs whitespace-pre-wrap text-muted">{updateOut}</pre>}
          </div>
        </Card>

        <Card title="FFmpeg">
          <div className="space-y-4">
            <Status ok={!!t.ffmpeg.path}>
              {t.ffmpeg.path ? (
                <>
                  ffmpeg {t.ffmpeg.version} · <span className="text-muted">{t.ffmpeg.path}</span>
                </>
              ) : (
                'ffmpeg.exe não encontrado: sem ele não dá para juntar vídeo e áudio nem converter'
              )}
            </Status>
            <Status ok={!!t.ffprobe.path}>
              {t.ffprobe.path ? (
                <>
                  ffprobe · <span className="text-muted">{t.ffprobe.path}</span>
                </>
              ) : (
                'ffprobe.exe não encontrado'
              )}
            </Status>
            {!t.ffprobe.path && (
              <div className="flex gap-2 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  Sem o ffprobe, “embutir miniatura” e algumas correções dão erro. Ele vem no mesmo pacote do ffmpeg (build “essentials” da gyan.dev, pasta
                  <code> bin</code>). Coloque o <code>ffprobe.exe</code> ao lado do <code>ffmpeg.exe</code> e clique em “Verificar programas de novo”.
                </div>
              </div>
            )}
            <PathField
              label="Caminho do ffmpeg.exe"
              value={s.ffmpegPath}
              placeholder={t.ffmpeg.path ?? 'C:\\caminho\\ffmpeg.exe'}
              onSave={(v) => ctx.saveSettings({ ffmpegPath: v })}
              pick={() => window.api.pickFile(s.ffmpegPath, 'ffmpeg', ['exe'])}
            />
          </div>
        </Card>

        <Card title="Runtime JavaScript (necessário para o YouTube)">
          <div className="space-y-4">
            <Status ok={!!t.jsRuntime}>
              {t.jsRuntime ? (
                <>
                  Usando {t.jsRuntime.name} · <span className="text-muted">{t.jsRuntime.path}</span>
                </>
              ) : (
                'Nenhum runtime: o YouTube pode esconder formatos ou falhar'
              )}
            </Status>
            <p className="text-xs text-muted">
              O YouTube exige resolver um desafio em JavaScript. O yt-dlp procura o Deno sozinho; com o Node, o app passa <code>--js-runtimes node</code>.
            </p>
            <div className="grid grid-cols-[220px_1fr] gap-3">
              <Field label="Qual usar">
                <Select value={s.jsRuntime} onChange={(e) => ctx.saveSettings({ jsRuntime: e.target.value as JsRuntimeChoice })}>
                  <option value="auto">Automático (Deno, depois Node)</option>
                  <option value="deno">Deno</option>
                  <option value="node">Node.js</option>
                  <option value="none">Nenhum</option>
                </Select>
              </Field>
              <PathField
                label="Caminho do executável (opcional)"
                value={s.jsRuntimePath}
                placeholder={t.jsRuntime?.path ?? 'C:\\caminho\\node.exe'}
                onSave={(v) => ctx.saveSettings({ jsRuntimePath: v })}
                pick={() => window.api.pickFile(s.jsRuntimePath, 'Runtime', ['exe'])}
              />
            </div>
          </div>
        </Card>

        <Card title="Criação de quadros (FPS)">
          <div className="space-y-4">
            <Status ok={!!ctx.caps?.frcAmf}>
              {ctx.caps?.frcAmf ? 'Placa AMD (frc_amf) disponível' : 'Placa AMD (frc_amf) indisponível nesta máquina'}
            </Status>
            <Status ok={t.rife.models.length > 0}>
              {t.rife.models.length ? `IA (RIFE) com ${t.rife.models.length} modelos` : 'IA (RIFE) não encontrada: a opção “IA” fica desligada'}
            </Status>
            {[...new Set(Object.values(t.rife.info).map((m) => m.exe))].map((exe) => {
              const models = t.rife.models.filter((id) => t.rife.info[id].exe === exe)
              const engine = t.rife.info[models[0]]?.engine
              return (
                <details key={exe} className="rounded-lg bg-panel-2 px-3 py-2 text-sm">
                  <summary className="cursor-pointer">
                    {engine ? `Instalação “${engine}”` : 'Instalação principal'} · {models.length} modelos · <span className="text-muted">{exe}</span>
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
              label="Caminho do rife-ncnn-vulkan.exe"
              value={s.rifePath}
              placeholder={t.rife.path ?? 'D:\\yt-dlp\\rife\\rife-ncnn-vulkan.exe'}
              onSave={(v) => ctx.saveSettings({ rifePath: v })}
              pick={() => window.api.pickFile(s.rifePath, 'RIFE', ['exe'])}
            />
            <p className="text-xs text-muted">
              Para usar mais modelos, coloque a pasta de cada um (com <code>flownet.param</code> e <code>flownet.bin</code>) ao lado de um{' '}
              <code>rife-ncnn-vulkan.exe</code>. Outra instalação inteira também vale: uma pasta <code>rife-alguma-coisa</code> ao lado da pasta{' '}
              <code>rife</code>. Depois clique em “Verificar programas de novo”.
            </p>
          </div>
        </Card>

        <Card title="Downloads">
          <div className="space-y-4">
            <Field label="Pasta de destino">
              <div className="flex gap-2">
                <TextInput value={s.downloadDir} readOnly />
                <Button
                  icon={<FolderOpen className="h-4 w-4" />}
                  onClick={async () => {
                    const d = await window.api.pickFolder(s.downloadDir)
                    if (d) await ctx.saveSettings({ downloadDir: d })
                  }}
                >
                  Escolher
                </Button>
              </div>
            </Field>
            <Field
              label="Modelo do nome do arquivo"
              hint={
                <>
                  Campos do yt-dlp entre <code>%(…)s</code>. Ex.: <code>%(uploader)s/%(title)s.%(ext)s</code> cria uma pasta por canal;{' '}
                  <code>%(playlist_index)03d - %(title)s.%(ext)s</code> numera os itens da playlist.
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
              <Field label="Downloads ao mesmo tempo">
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
