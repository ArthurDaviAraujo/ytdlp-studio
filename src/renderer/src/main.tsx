import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import MixerApp from './MixerApp'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.hash === '#mixer' ? <MixerApp /> : <App />}
  </StrictMode>
)
