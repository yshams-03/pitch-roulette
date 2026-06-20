import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './hooks/useTheme'
import { initSentry } from './lib/sentry'
import { ErrorBoundary } from './components/ErrorBoundary'
import App from './App.tsx'

initSentry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
