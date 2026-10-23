import type { CueView } from './narration-select'

/** Where a cue's words came from, plus the language label when a Tamil request had to fall back to English. */
export function ProvenanceChips({ view }: { readonly view: CueView }) {
  return (
    <span className="mc-chips">
      <span className={`mc-chip is-${view.source.toLowerCase()}`} data-testid="provenance-chip">{view.provenance}</span>
      {view.notice && <span className="mc-chip is-notice" data-testid="language-notice">{view.notice}</span>}
    </span>
  )
}

/** The persona's paragraphs. The language attribute sits on the text only, never on the English labels around it. */
export function CueParagraphs({ view }: { readonly view: CueView }) {
  return (
    <>
      {view.parts.map(part => (
        <p key={part.key} className={part.label ? 'mc-why' : 'mc-detail'} data-testid={`cue-text-${part.key}`}>
          {part.label && <strong>{part.label}</strong>}{part.label && ' '}
          <span lang={view.lang}>{part.text}</span>
        </p>
      ))}
    </>
  )
}
