import { useEffect, useId, useRef } from 'react'
import type { EvidenceExplorerInput, ContextEvidenceEntry } from '../contracts/interfaces'
import type { FactKey, ScenarioFieldsFragment } from '../contracts/graphql.generated'
import { UI_HOOKS } from '../contracts/ui-hooks'
import './evidence.css'

const factLabels: Record<FactKey, string> = {
  PASS_TIME_OBSERVED: 'Pass-time observation exists',
  RECEIVER_IN_OPPONENTS_HALF: "Receiver in opponents’ half",
  RECEIVER_AHEAD_OF_BALL: 'Receiver ahead of the ball',
  RECEIVER_VS_SECOND_LAST: 'Receiver versus second-last opponent',
  ACTIVE_INVOLVEMENT: 'Active involvement',
  PLAY_TYPE: 'Play type',
  INTERVENING_OPPONENT_TOUCH: 'Intervening opponent touch',
}
const reviewLabels = {
  DRAFT: 'Draft · not reviewed',
  SOURCE_CHECKED: 'Source checked · not expert-reviewed',
  EXPERT_REVIEWED: 'Expert review recorded in supplied metadata',
}

function factValue(fact: ScenarioFieldsFragment['facts'][number]) {
  if (fact.status === 'MISSING' || fact.value === null) return 'Missing · no observation supplied'
  switch (fact.value.__typename) {
    case 'BooleanFactValue': return fact.value.boolean ? 'Yes' : 'No'
    case 'PositionFactValue': return fact.value.position === 'LEVEL'
      ? 'Level with the second-last opponent' : 'Nearer the goal line than the second-last opponent'
    case 'InvolvementFactValue': return 'Touch · receiver plays the ball'
    case 'PlayTypeFactValue': return 'Open play'
  }
}

function contextValue(entry: ContextEvidenceEntry) {
  if (entry.value === null) return 'Missing · unavailable in supplied evidence'
  if (typeof entry.value !== 'string') return `${entry.value.home} – ${entry.value.away}`
  return { GOAL_AWARDED: 'Goal awarded', GOAL_DISALLOWED: 'Goal disallowed', GOAL_CONFIRMED: 'Goal confirmed' }[entry.value]
}

function safeHttps(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === ''
  } catch {
    return false
  }
}

export function EvidenceExplorer({ visibleFacts, contextEvidence, rules, selection }: EvidenceExplorerInput) {
  const prefix = useId()
  const targets = useRef(new Map<string, HTMLElement>())
  const unavailableRef = useRef<HTMLParagraphElement>(null)
  const references = [
    ...visibleFacts.map(fact => ({ key: `evidence:${fact.id}`, id: fact.id, label: factLabels[fact.key] })),
    ...contextEvidence.map(entry => ({ key: `evidence:${entry.id}`, id: entry.id, label: entry.label })),
    ...rules.map(rule => ({ key: `rule:${rule.id}`, id: rule.id, label: rule.title })),
  ]
  const selected = [
    ...(selection?.evidenceIds.map(id => `evidence:${id}`) ?? []),
    ...(selection?.ruleIds.map(id => `rule:${id}`) ?? []),
  ]
  const unresolved = selected.filter(key => !references.some(reference => reference.key === key))
  const domId = (key: string) => `${prefix}-${encodeURIComponent(key)}`
  const refFor = (key: string) => (element: HTMLElement | null) => {
    if (element) targets.current.set(key, element)
    else targets.current.delete(key)
  }
  useEffect(() => {
    if (!selection) return
    const keys = [
      ...selection.evidenceIds.map(id => `evidence:${id}`), ...selection.ruleIds.map(id => `rule:${id}`),
    ]
    const target = keys.map(key => targets.current.get(key)).find(Boolean)
    if (target) target.focus()
    else if (keys.length > 0) unavailableRef.current?.focus()
  }, [selection, visibleFacts, contextEvidence, rules])

  return (
    <div className="evidence-explorer" data-testid={UI_HOOKS.evidencePanel}>
      <p>Supplied synthetic evidence, not live observations. Hidden facts remain withheld until their replay event.</p>
      {unresolved.length > 0 && <p className="source-unavailable" role="alert" tabIndex={-1} ref={unavailableRef}>
        Reference unavailable or not yet revealed: {unresolved.map(key => key.slice(key.indexOf(':') + 1)).join(', ')}.
        No substitute source is inferred.
      </p>}
      <nav aria-label="Evidence and rule references" className="evidence-navigation">
        {references.map(reference => <a key={reference.key} href={`#${domId(reference.key)}`}
          onClick={event => { event.preventDefault(); targets.current.get(reference.key)?.focus() }}>
          {reference.id}<span className="visually-hidden">: {reference.label}</span>
        </a>)}
      </nav>
      <h3>Incident facts</h3>
      {visibleFacts.length === 0 && <p>No incident facts released yet.</p>}
      {visibleFacts.some(fact => fact.status === 'MISSING') &&
        <p className="missing-evidence" data-testid={UI_HOOKS.missingEvidence}>
          Missing decisive evidence: the absent position observations cannot be reconstructed or assigned a confidence score.
        </p>}
      <ul className="source-list">
        {visibleFacts.map(fact => <li key={fact.id} id={domId(`evidence:${fact.id}`)} tabIndex={-1}
          ref={refFor(`evidence:${fact.id}`)} data-source-id={fact.id} data-source-kind="evidence"
          data-selected={selected.includes(`evidence:${fact.id}`) || undefined}>
          <strong>{factLabels[fact.key]}</strong>
          <p>{factValue(fact)}</p>
          <small>{fact.id} · {fact.status === 'MISSING' ? 'Missing' : 'Supplied'} · {fact.sourceLabel}</small>
        </li>)}
      </ul>
      <h3>Match and decision context</h3>
      <ul className="source-list">
        {contextEvidence.map(entry => <li key={entry.id} id={domId(`evidence:${entry.id}`)} tabIndex={-1}
          ref={refFor(`evidence:${entry.id}`)} data-source-id={entry.id} data-source-kind="evidence"
          data-selected={selected.includes(`evidence:${entry.id}`) || undefined}>
          <strong>{entry.label}</strong><p>{contextValue(entry)}</p>
          <small>{entry.id} · {entry.status === 'MISSING' ? 'Missing' : 'Supplied'} · {entry.sourceLabel}</small>
        </li>)}
      </ul>
      <h3>Rule references</h3>
      <p>Original summaries for learning; VarAI is not an official decision or expert rules review.</p>
      <ul className="source-list">
        {rules.map(rule => <li key={rule.id} data-testid={UI_HOOKS.ruleReference} id={domId(`rule:${rule.id}`)}
          tabIndex={-1} ref={refFor(`rule:${rule.id}`)} data-source-id={rule.id} data-source-kind="rule"
          data-selected={selected.includes(`rule:${rule.id}`) || undefined}>
          <strong>{rule.title}</strong><p>{rule.summary}</p>
          <p>{rule.publisher} · {rule.section} · Edition: {rule.edition ?? 'unavailable'}</p>
          <p>{reviewLabels[rule.reviewStatus]} · Checked: {rule.checkedOn ?? 'not recorded'}</p>
          {safeHttps(rule.url)
            ? <a href={rule.url} target="_blank" rel="noopener noreferrer">Primary source (opens new tab)</a>
            : <p className="source-unavailable">Source link unavailable: a safe HTTPS reference is required.</p>}
          <small>{rule.id}</small>
        </li>)}
      </ul>
    </div>
  )
}
