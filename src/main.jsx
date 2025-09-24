import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ✅ Use the React SDK (not the Next.js one)
import { Analytics } from '@vercel/analytics/react'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    {/* Only send analytics from production builds */}
    {import.meta.env.PROD && <Analytics />}
  </StrictMode>,
)
