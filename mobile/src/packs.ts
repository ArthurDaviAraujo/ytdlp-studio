import { engine } from './native'

/**
 * As duas IAs do celular: o "motor" (ncnn, Vulkan) já vem no app; os modelos são baixados só por quem quiser usar,
 * da release "ia-pacotes" do GitHub, como no PC.
 */
const BASE = 'https://github.com/ArthurDaviAraujo/ytdlp-studio/releases/download/ia-pacotes/'

export interface MobilePack {
  id: 'rife' | 'esrgan'
  name: string
  hint: string
  files: { url: string; name: string; size: number }[]
}

export const MOBILE_PACKS: MobilePack[] = [
  {
    id: 'rife',
    name: 'Quadros novos com IA (RIFE v4.6)',
    hint: 'Cria os quadros que faltam para deixar o movimento mais suave (ex.: 30 → 60 fps).',
    files: [
      { url: BASE + 'android-rife-v4.6-flownet.param', name: 'flownet.param', size: 16749 },
      { url: BASE + 'android-rife-v4.6-flownet.bin', name: 'flownet.bin', size: 10614320 }
    ]
  },
  {
    id: 'esrgan',
    name: 'Melhorar imagem com IA (Real-ESRGAN)',
    hint: 'Dobra a resolução recriando os detalhes. Bom para vídeo pequeno ou borrado.',
    files: [
      { url: BASE + 'android-realesr-animevideov3-x2.param', name: 'x2.param', size: 3173 },
      { url: BASE + 'android-realesr-animevideov3-x2.bin', name: 'x2.bin', size: 1247368 }
    ]
  }
]

let filesDir = '/demo/files'
void engine.dirs().then((d) => (filesDir = d.files))

/** Pasta do modelo dentro do app */
export const modelDir = (id: MobilePack['id']) => `${filesDir}/modelos/${id}`

export const packSize = (p: MobilePack) => p.files.reduce((s, f) => s + f.size, 0)

export async function packInstalled(p: MobilePack): Promise<boolean> {
  for (const f of p.files) if (!(await engine.exists({ path: `${modelDir(p.id)}/${f.name}` })).exists) return false
  return true
}

export async function installPack(p: MobilePack): Promise<string | null> {
  const whole = packSize(p)
  let base = 0
  for (const f of p.files) {
    const r = await engine.fetchFile({ id: `pack-${p.id}`, url: f.url, path: `${modelDir(p.id)}/${f.name}`, size: f.size, base, whole })
    if (!r.ok) return r.error
    base += f.size
  }
  return null
}

export async function removePack(p: MobilePack): Promise<void> {
  await engine.remove({ path: modelDir(p.id) })
}
