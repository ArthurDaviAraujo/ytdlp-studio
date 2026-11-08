// Site do yt-dlp GUI: botão de instalar que acha o arquivo certo, versões vindas do GitHub, idioma e tema.
// Sem JavaScript, os links continuam levando às páginas das releases.

const REPO = 'ArthurDaviAraujo/ytdlp-studio'
const PAGINA = `https://github.com/${REPO}/releases`

// Valores de reserva (se o GitHub não responder): a última versão conhecida de cada um
const versoes = {
  windows: {
    v: '1.5.0', data: '2026-11-04', bytes: 272526131,
    url: `${PAGINA}/download/v1.5.0/ytdlp-studio-Setup-1.5.0.exe`, pagina: `${PAGINA}/tag/v1.5.0`
  },
  android: {
    v: '1.0.1', data: '2026-11-08', bytes: 61885848,
    url: `${PAGINA}/download/android-v1.0.1/ytdlp-gui-android-1.0.1-arm64.apk`, pagina: `${PAGINA}/tag/android-v1.0.1`
  }
}

// Todas as versões (para o menu); até o GitHub responder, só a mais nova de cada
const todas = { windows: [versoes.windows], android: [versoes.android] }

// ---------- Idioma ----------
const EN = {
  'nav-baixar': 'Download',
  'nav-todas': 'All versions',
  'nav-recursos': 'Features',
  'nav-instalar': 'How to install',
  titulo: 'Download and prepare videos',
  chamada: 'Download from more than 1,700 sites and get everything ready for TikTok, Reels and Shorts, with AI, on your PC and your Android phone.',
  instalar: 'Install',
  'ver-github': 'View on GitHub',
  ultima: 'Latest stable release',
  baixar: 'Download',
  'nota-windows': 'Windows 10 or 11, 64-bit. The AIs are downloaded inside the app, only if you use them.',
  'nota-android': 'Android 7 or newer. The app tells you when a new version is out.',
  'r1-t': 'Download almost anything',
  'r1-p': 'YouTube, TikTok, Instagram and more than 1,700 sites. Max quality in one click, audio only, subtitles, playlists and chapters.',
  'r1-l': 'See all options',
  'r2-t': 'Ready for social media',
  'r2-p': 'TikTok, Reels, Shorts and feed: size, framing, blurred background, text and logo. The crop can follow a face or a person.',
  'r2-l': 'Get started',
  'r3-t': 'New frames with AI',
  'r3-p': 'RIFE creates the missing frames: 30 to 60 fps or smooth slow motion. 47 models running on your graphics card.',
  'r3-l': 'About RIFE',
  'r4-t': 'Enhance the image',
  'r4-p': 'Real-ESRGAN and Real-CUGAN upscale up to 4K. Denoise, sharpness, color and 7 ready-made recipes, with a before and after view.',
  'r4-l': 'See before and after',
  'r5-t': 'Video editor',
  'r5-p': 'Cuts on a timeline, several music tracks, a mixer with EQ and speed from 0.1x to 16x. Ctrl+Z for everything.',
  'r5-l': 'Learn more',
  'r6-t': 'Subtitles and voice',
  'r6-p': 'Automatic subtitles with Whisper, word by word in TikTok style. It also separates the voice from the music.',
  'r6-l': 'Learn more',
  'veja-t': 'See the difference',
  'veja-p': 'A heavily compressed video, the "Very compressed" recipe and the Real-ESRGAN AI. Drag the divider in the app to compare before and after.',
  'veja-1': 'Runs on your graphics card (AMD, NVIDIA or Intel)',
  'veja-2': 'Estimates how long it will take before starting',
  'veja-3': 'Works together with RIFE’s new frames',
  'inst-t': 'How to install',
  'inst-p': 'Free, no account and no ads.',
  w1: 'Download the installer (.exe).',
  w2: 'If you see "Windows protected your PC", click <b>More info</b> and then <b>Run anyway</b>.',
  w3: 'Follow the installer. The app tells you when a new version is out.',
  'baixar-win': 'Download for Windows',
  a1: 'On your phone, download the APK (arm64).',
  a2: 'Tap the downloaded file and allow <b>installing apps from this source</b>.',
  a3: 'If Play Protect warns you, tap <b>More details</b> and <b>Install anyway</b>.',
  'baixar-and': 'Download for Android',
  'faq-t': 'Questions',
  q1: 'Is it really free?',
  r1: 'Yes. The code is open source (MIT license) and lives on GitHub. No account, subscription or ads.',
  q2: 'Why isn’t it on the Play Store?',
  r2: 'Google usually rejects apps that download videos from sites like YouTube. So the APK comes straight from GitHub, always signed with the same key.',
  q3: 'Do I need a good graphics card?',
  r3: 'Not to download and prepare. The AIs use the graphics card through Vulkan and are much faster with it. The app shows how long it will take before starting.',
  q4: 'A site stopped working. What now?',
  r4: 'Sites change often. In Settings, tap "Update yt-dlp". The phone app already does this by itself once a day.',
  'rod-1': 'Open source, MIT license',
  'rod-2': 'Uses yt-dlp, ffmpeg and open-source AIs. Not affiliated with the yt-dlp project.'
}
const PT_EXTRA = { 'nota-android': 'Android 7 ou mais novo. O app avisa quando sair uma versão nova.' }

let idioma = 'pt'
try { idioma = localStorage.getItem('site-idioma') || (navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en') } catch (e) {}

// O português é o texto que já está no HTML; cada chave guarda o seu
const PT = { ...PT_EXTRA }
document.querySelectorAll('[data-i18n]').forEach((el) => {
  if (!(el.dataset.i18n in PT)) PT[el.dataset.i18n] = el.innerHTML
})

const t = (chave) => (idioma === 'en' ? EN[chave] : PT[chave]) ?? PT[chave] ?? chave

function aplicarIdioma() {
  document.documentElement.lang = idioma === 'en' ? 'en' : 'pt-BR'
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18n)
  })
  document.getElementById('trocar-idioma').textContent = idioma === 'en' ? 'PT' : 'EN'
  atualizar()
}

document.getElementById('trocar-idioma').addEventListener('click', () => {
  idioma = idioma === 'en' ? 'pt' : 'en'
  try { localStorage.setItem('site-idioma', idioma) } catch (e) {}
  aplicarIdioma()
})

// ---------- Tema ----------
document.getElementById('trocar-tema').addEventListener('click', () => {
  const novo = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'
  document.documentElement.dataset.theme = novo
  document.querySelector('meta[name=theme-color]').content = novo === 'light' ? '#f6f7f9' : '#0b0d12'
  try { localStorage.setItem('site-tema', novo) } catch (e) {}
})

// ---------- Menu Baixar ----------
const suspenso = document.getElementById('menu-baixar')
suspenso.querySelector('button').addEventListener('click', (e) => {
  e.stopPropagation()
  const aberto = suspenso.classList.toggle('aberto')
  suspenso.querySelector('button').setAttribute('aria-expanded', String(aberto))
})
document.addEventListener('click', () => suspenso.classList.remove('aberto'))
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') suspenso.classList.remove('aberto') })

// ---------- Qual aparelho está abrindo o site ----------
const ua = navigator.userAgent
const sistema = /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) && !/Windows Phone/i.test(ua) ? 'windows' : 'outro'
let aba = sistema === 'android' ? 'android' : 'windows'

function formatarData(iso) {
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''))
  return d.toLocaleDateString(idioma === 'en' ? 'en-US' : 'pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}
const mb = (b) => Math.round(b / 1048576) + ' MB'

function atualizar() {
  const w = versoes.windows
  const a = versoes.android
  const r = versoes[aba]

  // Cartão da versão
  document.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', b.dataset.plataforma === aba))
  document.getElementById('cartao-nome').textContent = `yt-dlp GUI v${r.v}`
  document.getElementById('cartao-data').textContent =
    (idioma === 'en' ? 'Released ' : 'Lançada em ') + formatarData(r.data) + (r.bytes ? ' · ' + mb(r.bytes) : '')
  document.getElementById('cartao-baixar').href = r.url
  const nota = document.getElementById('cartao-nota')
  nota.dataset.i18n = aba === 'android' ? 'nota-android' : 'nota-windows'
  nota.innerHTML = t(nota.dataset.i18n)

  // Menu, selos e botões das instruções
  document.getElementById('nav-versao').textContent = 'v' + (sistema === 'android' ? a.v : w.v)
  montarMenu()
  document.getElementById('selo-win').textContent = 'v' + w.v
  document.getElementById('selo-and').textContent = 'v' + a.v
  document.getElementById('baixar-windows').href = w.url
  document.getElementById('baixar-android').href = a.url

  // Botão principal: baixa direto no Windows e no Android; nos outros sistemas leva às instruções
  const botao = document.getElementById('instalar-principal')
  const texto = document.getElementById('instalar-texto')
  if (sistema === 'outro') {
    botao.href = '#instalar'
    texto.textContent = idioma === 'en' ? 'Install' : 'Instalar'
  } else {
    botao.href = versoes[sistema].url
    texto.textContent = (idioma === 'en' ? 'Install on ' : 'Instalar no ') + (sistema === 'android' ? 'Android' : 'Windows')
  }
  document.getElementById('passos-windows').classList.toggle('destaque', sistema === 'windows')
  document.getElementById('passos-android').classList.toggle('destaque', sistema === 'android')
}

document.querySelectorAll('.aba').forEach((b) =>
  b.addEventListener('click', () => {
    aba = b.dataset.plataforma
    atualizar()
  })
)

// Menu "Baixar": todas as versões de cada sistema, a mais nova primeiro e marcada
function montarMenu() {
  const en = idioma === 'en'
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const grupo = (titulo, lista, ext) =>
    `<div class="grupo-titulo">${titulo}</div>` +
    lista
      .map((r, i) => {
        const selo = i === 0 ? ` <em class="mais-nova">${en ? 'Latest' : 'Mais nova'}</em>` : ''
        const data = r.data ? formatarData(r.data.slice(0, 10)) : ext
        return `<a role="menuitem" class="${i ? 'antiga' : ''}" href="${esc(r.url)}"><span>v${esc(r.v)}${selo}</span><small>${esc(data)}</small></a>`
      })
      .join('')
  // O sistema de quem abre o site vem primeiro
  const w = grupo('Windows', todas.windows, '.exe')
  const a = grupo('Android', todas.android, '.apk')
  document.getElementById('lista-versoes').innerHTML =
    (sistema === 'android' ? a + w : w + a) +
    `<a role="menuitem" class="todas" href="${PAGINA}" target="_blank" rel="noopener"><span>${en ? 'All on GitHub' : 'Todas no GitHub'}</span><small>↗</small></a>`
}

// ---------- Versões mais novas, direto do GitHub ----------
const maior = (x, y) => {
  const a = x.split('.').map(Number), b = y.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  return false
}

async function buscarVersoes() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!r.ok) return
  const lista = await r.json()
  const win = [], and = []
  for (const rel of lista) {
    if (rel.draft || rel.prerelease) continue
    const mw = /^v(\d+(?:\.\d+)*)$/.exec(rel.tag_name)
    const ma = /^android-v(\d+(?:\.\d+)*)$/.exec(rel.tag_name)
    if (mw) {
      const exe = rel.assets.find((x) => x.name.endsWith('.exe'))
      if (exe) win.push({ v: mw[1], data: rel.published_at, bytes: exe.size, url: exe.browser_download_url, pagina: rel.html_url })
    } else if (ma) {
      const apk = rel.assets.find((x) => x.name.endsWith('.apk') && x.name.includes('arm64'))
      if (apk) and.push({ v: ma[1], data: rel.published_at, bytes: apk.size, url: apk.browser_download_url, pagina: rel.html_url })
    }
  }
  const ordem = (x, y) => (maior(x.v, y.v) ? -1 : maior(y.v, x.v) ? 1 : 0)
  if (win.length) (todas.windows = win.sort(ordem)), (versoes.windows = todas.windows[0])
  if (and.length) (todas.android = and.sort(ordem)), (versoes.android = todas.android[0])
  atualizar()
}

aplicarIdioma()
buscarVersoes().catch(() => { /* sem internet ou limite do GitHub: ficam os valores de reserva */ })
