import { useEffect, useState } from 'react'
import Mixer, { type EditorToMixer, type MixerState, type MixerToEditor } from './components/Mixer'
import { setLang } from '../../shared/i18n'

const post = (msg: MixerToEditor) => window.api.mixerPost(msg)

/** Tela da janela do mixer: recebe o estado e os níveis do editor e devolve o que a pessoa mexe. */
export default function MixerApp() {
  const [state, setState] = useState<MixerState | null>(null)
  const [levels, setLevels] = useState<Record<string, number>>({})

  useEffect(() => {
    const off = window.api.onMixerMessage((raw) => {
      const msg = raw as EditorToMixer
      if (msg.type === 'state') {
        setLang(msg.state.lang)
        document.title = 'Mixer'
        document.documentElement.lang = msg.state.lang === 'pt' ? 'pt-BR' : 'en'
        setState(msg.state)
      } else if (msg.type === 'levels') setLevels(msg.levels)
    })
    post({ type: 'hello' })
    return off
  }, [])

  if (!state) return <div className="h-full bg-bg" />

  // Atualiza na hora aqui (controle sem tranco) e avisa o editor, que é quem guarda os valores
  const local = (id: string, patch: Partial<MixerState['channels'][number]>) =>
    setState((s) => (s ? { ...s, channels: s.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)) } : s))

  return (
    <Mixer
      channels={state.channels.map((c) => ({
        ...c,
        level: levels[c.id] ?? 0,
        onChange: (value) => {
          local(c.id, { value })
          post({ type: 'set', id: c.id, value })
        },
        onEq: (eq) => {
          local(c.id, { eq })
          post({ type: 'eq', id: c.id, eq })
        }
      }))}
      onReset={() => post({ type: 'reset' })}
      onClose={() => void window.api.mixerClose()}
    />
  )
}
