import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { seedDefaults } from './lib/seed/seed'

async function bootstrap() {
  await seedDefaults()
  // Best-effort durable storage request (SPEC 30, STORAGE PERSISTENCE).
  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => undefined)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
