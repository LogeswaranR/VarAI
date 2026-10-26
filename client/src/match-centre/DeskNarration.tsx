import { usageFacts } from './desk-format'
import { deskSourceLabels, fieldLabels, languageNotice, MECHANICAL_CHECKS_NOTE, reasonLabel, verificationSummary } from './narration-labels'
import { languageNames, narrationFields } from './narration-model'
import type { CueNarration, ModelUsage, NarrationLanguage } from './narration-model'

export function VerificationBlock({ narration }: { readonly narration: CueNarration }) {
  const { verification } = narration
  const summary = verificationSummary(verification)
  return (
    <div className="mc-verification" data-testid="verification">
      <p>
        <span className={`mc-chip ${summary.kind === 'passed' ? 'is-pass' : summary.kind === 'flagged' ? 'is-flag' : 'is-none'}`}>
          {summary.text}
        </span>
      </p>
      <p className="mc-note">
        {MECHANICAL_CHECKS_NOTE}
        {summary.kind === 'none' && ' This is the rules\' deterministic wording, not AI output, so there was nothing to check.'}
        {narration.source === 'FALLBACK' && summary.kind === 'flagged' &&
          ' The flags describe an AI draft that was rejected; the text shown is the deterministic fallback.'}
        {narration.source === 'OPERATOR' && ' For operator-edited text these checks are advisory: they are recorded, not enforced.'}
      </p>
      {verification && verification.failures.length > 0 && (
        <details>
          <summary>Show the flagged {verification.failures.length === 1 ? 'check' : 'checks'} ({verification.failures.length})</summary>
          <ul className="mc-failures">
            {verification.failures.map((failure, index) => (
              <li key={`${failure.check}-${failure.field}-${index}`}><code>{failure.check}</code> · {failure.field}: {failure.detail}</li>
            ))}
          </ul>
        </details>
      )}
      {verification && verification.passedChecks.length > 0 && <p className="mc-note">Passed: {verification.passedChecks.join(', ')}.</p>}
    </div>
  )
}

export function UsageBlock({ usage }: { readonly usage: ModelUsage }) {
  return (
    <div className="mc-usage" data-testid="model-usage">
      <p className="mc-kicker">Model usage</p>
      <dl className="mc-facts">
        {usageFacts(usage).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </div>
  )
}

export function SourceChips({ narration }: { readonly narration: CueNarration }) {
  const notice = languageNotice(narration)
  return (
    <p className="mc-chips">
      <span className={`mc-chip is-${narration.source.toLowerCase()}`} data-testid="source-chip">
        {deskSourceLabels[narration.source]}
        {narration.source === 'FALLBACK' && ` (reason: ${reasonLabel(narration.fallbackReason)})`}
      </span>
      {notice && <span className="mc-chip is-notice" data-testid="language-notice">{notice}</span>}
    </p>
  )
}

export function NarrationColumn({ narration, language, showUsage }: {
  readonly narration: CueNarration
  readonly language: NarrationLanguage
  readonly showUsage: boolean
}) {
  return (
    <section className="mc-narration-column" aria-label={`${languageNames[language]} narration`} data-language={language}>
      <h4>{languageNames[language]}{language === 'ta' && <> <span lang="ta">(தமிழ்)</span></>}</h4>
      <SourceChips narration={narration} />
      <dl className="mc-narration">
        {narrationFields.map(field => (
          <div key={field}>
            <dt>{fieldLabels[field]}</dt>
            <dd lang={narration.language}>{narration.text[field]}</dd>
          </div>
        ))}
      </dl>
      <VerificationBlock narration={narration} />
      {showUsage && narration.usage && <UsageBlock usage={narration.usage} />}
    </section>
  )
}
