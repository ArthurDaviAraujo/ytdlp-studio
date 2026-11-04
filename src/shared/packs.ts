import type { WhisperModel } from './types'

/** IAs e modelos que o app baixa só quando alguém vai usar (o instalador fica bem menor sem eles) */
export interface PackDef {
  id: string
  name: string
  hint: string
  /** Tamanho do download (bytes) */
  size: number
  url: string
  /** Caminho, dentro da pasta de programas, que prova que está instalado */
  check: string
  /** Se for um .zip: a pasta onde ele é extraído */
  zip?: string
}

// As IAs ficam numa release separada do app (mesmo repositório), com as licenças de cada uma dentro do .zip
const OURS = 'https://github.com/ArthurDaviAraujo/ytdlp-studio/releases/download/ia-pacotes/'
const WHISPER = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/'

export const WHISPER_FILES: Record<WhisperModel, string> = {
  base: 'ggml-base.bin',
  small: 'ggml-small.bin',
  turbo: 'ggml-large-v3-turbo-q5_0.bin'
}

export const PACKS: PackDef[] = [
  { id: 'rife', name: 'RIFE (oficial)', hint: 'Cria quadros novos com IA (11 modelos).', size: 431191733, url: OURS + 'rife.zip', check: 'rife/rife-ncnn-vulkan.exe', zip: 'rife' },
  { id: 'rife-comunidade', name: 'RIFE da comunidade', hint: 'Mais 36 modelos do RIFE (v4.7 a v4.26, lite, heavy).', size: 397329355, url: OURS + 'rife-comunidade.zip', check: 'rife-comunidade/rife-ncnn-vulkan.exe', zip: 'rife-comunidade' },
  { id: 'realesrgan', name: 'Real-ESRGAN', hint: 'Ampliar com IA (vídeo real, foto e anime).', size: 45008615, url: OURS + 'realesrgan.zip', check: 'realesrgan/realesrgan-ncnn-vulkan.exe', zip: 'realesrgan' },
  { id: 'realcugan', name: 'Real-CUGAN', hint: 'Ampliar com IA (anime e desenho).', size: 45986536, url: OURS + 'realcugan.zip', check: 'realcugan/realcugan-ncnn-vulkan.exe', zip: 'realcugan' },
  { id: 'whisper', name: 'Whisper', hint: 'Programa das legendas automáticas.', size: 3947309, url: OURS + 'whisper.zip', check: 'whisper/whisper-cli.exe', zip: 'whisper' },
  { id: 'whisper-base', name: 'Legendas: modelo rápido', hint: 'Whisper base. Rápido e bom para fala clara.', size: 147951465, url: WHISPER + WHISPER_FILES.base, check: 'whisper/models/' + WHISPER_FILES.base },
  { id: 'whisper-small', name: 'Legendas: modelo melhor', hint: 'Whisper small. Erra menos; uns 3x mais lento que o rápido.', size: 487601967, url: WHISPER + WHISPER_FILES.small, check: 'whisper/models/' + WHISPER_FILES.small },
  { id: 'whisper-turbo', name: 'Legendas: modelo máximo', hint: 'Whisper large-v3 turbo. O que mais acerta, inclusive com barulho; o mais lento.', size: 574041195, url: WHISPER + WHISPER_FILES.turbo, check: 'whisper/models/' + WHISPER_FILES.turbo },
  { id: 'separar-voz', name: 'Separar voz e música', hint: 'Modelo Kim Vocal 2 (UVR MDX-Net).', size: 66759214, url: 'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/Kim_Vocal_2.onnx', check: 'separar/Kim_Vocal_2.onnx' }
]

export const packFor = (id: string) => PACKS.find((p) => p.id === id)
export const whisperPack = (m: WhisperModel) => `whisper-${m}`
