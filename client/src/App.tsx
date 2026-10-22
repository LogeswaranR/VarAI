function App() {
  return (
    <main className="app">
      <header>
        <p className="status">Synthetic prototype - scaffold only</p>
        <h1>VarAI</h1>
        <p className="lead">
          An evidence-backed offside-review explainer, not an AI referee.
        </p>
      </header>

      <section aria-labelledby="scaffold-heading" className="notice">
        <h2 id="scaffold-heading">Development scaffold</h2>
        <p>
          This is the application shell. Review features are not implemented.
        </p>
        <ul>
          <li>Replay, illustrative scenes and source inspection are not available.</li>
          <li>Authored and live-model explanations are not available.</li>
          <li>No match evidence is loaded and no model calls are made.</li>
        </ul>
      </section>

      <p>
        <a href="/health">Check backend health</a>
      </p>
    </main>
  )
}

export default App
