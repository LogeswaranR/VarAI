import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HarnessPage } from './HarnessPage'
import './harness.css'

const root = document.getElementById('harness-root')
if (!root) throw new Error('The test harness root is missing.')
createRoot(root).render(<StrictMode><HarnessPage /></StrictMode>)
