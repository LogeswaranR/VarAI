import { createRoot } from 'react-dom/client'
import { HarnessPage } from '../../../client/src/harness/HarnessPage'
import '../../../client/src/harness/harness.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing test root.')
createRoot(root).render(<HarnessPage />)
