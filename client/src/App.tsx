import { ReviewRoom } from './review-room'
import { appPanels } from './app-panels'
import { createHttpClients } from './transport/graphql'

const collaborators = createHttpClients()

function App() {
  const initialScenarioId = new URLSearchParams(window.location.search).get('scenario') ?? 'S1'
  return <>
    <a className="skip-link" href="#review">Skip to review room</a>
    <header className="app-header">
      <a className="app-brand" href="/">VarAI <span>Replay lab</span></a>
      <span>Offside, explained through supplied evidence</span>
      <a href="/health">Backend health</a>
    </header>
    <main id="review" className="app" tabIndex={-1}>
      <ReviewRoom {...collaborators} slots={appPanels} initialScenarioId={initialScenarioId} />
    </main>
  </>
}

export default App
