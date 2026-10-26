import { MatchCentre } from './match-centre/MatchCentre'
import { ReviewRoom } from './review-room'
import { appPanels } from './app-panels'
import { createHttpClients } from './transport/graphql'

const collaborators = createHttpClients()

function App() {
  const params = new URLSearchParams(window.location.search)
  const scenario = params.get('scenario')
  const review = scenario !== null || params.get('view') === 'review'
  const mainId = review ? 'review' : 'match-centre'
  return <>
    <a className="skip-link" href={`#${mainId}`}>{review ? 'Skip to review room' : 'Skip to match centre'}</a>
    <header className={`app-header${review ? '' : ' app-header-match'}`}>
      <div className="app-header-inner">
        <a className="app-brand" href="/">
          <svg viewBox="0 0 36 40" aria-hidden="true"><path d="M2 4h9l7 19L26 4h9L20 37h-5Z" /></svg>
          <span>VarAI<small>Match insights</small></span>
        </a>
        <nav className="app-navigation" aria-label="Workspace navigation">
          <a className={review ? undefined : 'app-nav-current'} aria-current={review ? undefined : 'page'} href="/">Match centre</a>
          <a className={review ? 'app-nav-current' : undefined} aria-current={review ? 'page' : undefined} href="/?scenario=S1">Key-moment review</a>
          {review && <a href="#evidence">Evidence</a>}
          <a href="/health">Backend health</a>
        </nav>
        <span className="app-environment"><span aria-hidden="true" />Synthetic data only</span>
      </div>
    </header>
    <main id={mainId} className="app" tabIndex={-1}>
      {review
        ? <ReviewRoom {...collaborators} slots={appPanels} initialScenarioId={scenario ?? 'S1'} />
        : <MatchCentre />}
    </main>
  </>
}

export default App
