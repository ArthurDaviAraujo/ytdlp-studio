import { useState } from 'react'
import { ArrowDownToLine, CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react'
import { t } from '../../../src/shared/i18n'
import { engine } from '../native'
import { PackRow } from '../PackRow'
import { Button, Card, Field, Segmented, Spinner } from '../ui'
import type { Ctx } from '../App'

export default function SettingsPage({ ctx }: { ctx: Ctx }) {
  const [updating, setUpdating] = useState(false)
  const [checking, setChecking] = useState(false)
  const st = ctx.status
  return (
    <div className="space-y-4 p-4 pb-8">
      <Card className="space-y-3">
        <Field label={t('Idioma (Language)')}>
          <Segmented<'pt' | 'en'>
            value={ctx.lang}
            onChange={ctx.setLangPref}
            options={[
              { value: 'pt', label: 'Português' },
              { value: 'en', label: 'English' }
            ]}
          />
        </Field>
      </Card>

      <Card className="space-y-3">
        <div className="text-[15px] font-medium">yt-dlp</div>
        <div className="flex items-center gap-2 text-[14px] text-ok">
          <CircleCheck className="h-4 w-4" /> {t('Versão {v}', { v: st?.ytdlp ?? '…' })}
        </div>
        <p className="text-[13px] text-muted">{t('Sites como o YouTube mudam com frequência. Se um download parar de funcionar, atualizar costuma resolver.')}</p>
        <Button
          icon={updating ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
          disabled={updating}
          onClick={async () => {
            setUpdating(true)
            const r = await engine.updateYtdlp()
            setUpdating(false)
            ctx.toast(r.status === 'DONE' ? t('yt-dlp atualizado para {version}', { version: r.version ?? '' }) : t('Você está na mais nova ({current})', { current: r.version ?? '' }))
          }}
        >
          {updating ? t('Atualizando…') : t('Atualizar yt-dlp')}
        </Button>
      </Card>

      <Card>
        <div className="text-[15px] font-medium">{t('IAs (baixe só se for usar)')}</div>
        {st && !st.vulkan && (
          <p className="mt-2 flex items-start gap-1.5 text-[13px] text-warn">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {t('A placa deste celular não tem Vulkan; as IAs não rodam aqui.')}
          </p>
        )}
        {st?.gpu && <p className="mt-1 text-[13px] text-muted">{t('Placa: {gpu}', { gpu: st.gpu })}</p>}
        <div className="divide-y divide-line">
          <PackRow id="rife" />
          <PackRow id="esrgan" />
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="text-[15px] font-medium">{t('App')}</div>
        {ctx.appUpdate ? (
          <>
            <div className="text-[14px] text-accent">{t('Versão nova do app: {v}', { v: ctx.appUpdate.version })}</div>
            <p className="text-[13px] text-muted">{t('O navegador baixa o APK; depois é só tocar nele para instalar por cima. Seus downloads e IAs continuam.')}</p>
            <Button icon={<ArrowDownToLine className="h-4 w-4" />} onClick={() => void engine.openUrl({ url: ctx.appUpdate!.url })}>
              {t('Baixar a versão {v}', { v: ctx.appUpdate.version })}
            </Button>
          </>
        ) : (
          <Button
            icon={checking ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
            disabled={checking}
            onClick={async () => {
              setChecking(true)
              try {
                const u = await ctx.checkUpdate()
                if (!u) ctx.toast(t('Você está na mais nova ({current})', { current: __APP_VERSION__ }))
              } catch {
                ctx.toast(t('Não deu para falar com o GitHub agora'))
              }
              setChecking(false)
            }}
          >
            {checking ? t('Procurando…') : t('Procurar versão nova')}
          </Button>
        )}
        <div className="space-y-1 text-[13px] text-muted">
          <div>{t('Os arquivos vão para Download/yt-dlp GUI e aparecem na galeria.')}</div>
          <div>yt-dlp GUI {__APP_VERSION__} · github.com/ArthurDaviAraujo/ytdlp-studio</div>
        </div>
      </Card>
    </div>
  )
}
