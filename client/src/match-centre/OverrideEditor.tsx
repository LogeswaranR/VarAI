import { useId, useState } from 'react'
import type { ProposalView } from './gate-model'
import { fieldLabels } from './narration-labels'
import { EDIT_LIMITS, languageNames, narrationFields, narrationLanguages } from './narration-model'
import type { NarrationLanguage, NarrationText } from './narration-model'
import { draftsOf, fieldProblem, planOverride } from './override-edits'
import type { Drafts } from './override-edits'

export function OverrideEditor({ id, proposal, disabled, onSave, onCancel }: {
  readonly id: string
  readonly proposal: ProposalView
  readonly disabled: boolean
  readonly onSave: (edits: Readonly<Partial<Record<NarrationLanguage, NarrationText>>>) => void
  readonly onCancel: () => void
}) {
  const baseId = useId()
  const [originals] = useState(() => draftsOf(proposal.narrations))
  const [drafts, setDrafts] = useState<Drafts>(originals)
  const plan = planOverride(drafts, originals)
  const canSave = !disabled && plan.changed.length > 0 && plan.problems.length === 0
  const hint = plan.changed.length === 0 ? 'Change at least one field to override.'
    : plan.problems.length > 0 ? 'Fix the marked fields before saving.' : null

  return (
    <form id={id} className="mc-override" aria-label={`Override ${proposal.approvalId}`}
      onSubmit={event => {
        event.preventDefault()
        if (canSave) onSave(plan.edits)
      }}>
      <p className="mc-note">
        Edit the words that would air. Only the languages you change are sent; a language you leave alone keeps its current text.
        Operator edits are recorded with the decision, and the mechanical checks on them are advisory.
      </p>
      {narrationLanguages.map(language => (
        <fieldset key={language} className="mc-override-language">
          <legend>{languageNames[language]}{language === 'ta' && <> <span lang="ta">(தமிழ்)</span></>}</legend>
          {language === 'ta' && proposal.narrations.ta.language !== 'ta' && (
            <p className="mc-note">
              The current Tamil text is the English fallback. Type Tamil text here to send a Tamil override; if you leave it unchanged it is not sent.
            </p>
          )}
          {narrationFields.map(field => {
            const id = `${baseId}-${language}-${field}`
            const value = drafts[language][field]
            const problem = plan.changed.includes(language) ? fieldProblem(language, field, value) : null
            return (
              <div className="mc-edit-field" key={field}>
                <label htmlFor={id}><span className="mc-sr-only">{languageNames[language]}</span>{' '}{fieldLabels[field]}</label>
                <textarea id={id} lang={language} rows={field === 'headline' ? 2 : 3} value={value} disabled={disabled}
                  aria-invalid={problem !== null} aria-describedby={`${id}-count`}
                  onChange={event => {
                    const next = event.target.value
                    setDrafts(current => ({ ...current, [language]: { ...current[language], [field]: next } }))
                  }} />
                <span id={`${id}-count`} className={problem ? 'mc-count is-over' : 'mc-count'}>
                  {value.trim().length}/{EDIT_LIMITS[language][field]}{problem && ` · ${problem}`}
                </span>
              </div>
            )
          })}
        </fieldset>
      ))}
      <div className="mc-override-actions">
        <button type="submit" className="mc-primary" disabled={!canSave}>Save override</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        {hint && <span className="mc-note">{hint}</span>}
      </div>
    </form>
  )
}
