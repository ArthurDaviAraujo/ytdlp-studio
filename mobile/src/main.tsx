import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { en } from '../../src/shared/i18n-en'
import { mobileEn } from './i18n-mobile'
import App from './App'

// Textos só do celular entram no mesmo dicionário de inglês do app de PC
Object.assign(en, mobileEn)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
