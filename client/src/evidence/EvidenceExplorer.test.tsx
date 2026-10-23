import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fixture, snapshot } from '../harness/fixtures'
import type { EvidenceExplorerInput } from '../contracts/interfaces'
import { UI_HOOKS } from '../contracts/ui-hooks'
import { EvidenceExplorer } from './EvidenceExplorer'

function input(id: 'S1' | 'S3' = 'S1'): EvidenceExplorerInput {
  const state = snapshot(fixture(id), 'review-ready', 1, null)
  return state.evidence
}

describe('VAR-104 evidence and reference focus', () => {
  it('retains missing facts, context nulls, provenance and honest draft metadata', () => {
    const props = input('S3')
    render(<EvidenceExplorer {...props} />)
    expect(screen.getByTestId(UI_HOOKS.missingEvidence)).toHaveTextContent('Missing decisive evidence')
    expect(screen.getAllByText('Missing · no observation supplied')).toHaveLength(2)
    expect(screen.getAllByText('Missing · unavailable in supplied evidence')).toHaveLength(2)
    expect(screen.getAllByText(/Draft · not reviewed/)).toHaveLength(props.rules.length)
    expect(screen.getAllByTestId(UI_HOOKS.ruleReference)[0]).toHaveTextContent('2026/27')
    expect(screen.getAllByTestId(UI_HOOKS.ruleReference)[0]).toHaveTextContent(props.rules[0].section)
  })

  it.each(['F-PASS', 'DECISION-ORIGINAL', 'DECISION-REVIEW', 'MATCH-SCORE-BEFORE', 'MATCH-SCORE-AFTER'])(
    'focuses visible evidence %s and clears old emphasis', id => {
      const props = input()
      const { container, rerender } = render(<EvidenceExplorer {...props} selection={{ evidenceIds: [id], ruleIds: [] }} />)
      expect(container.querySelector(`[data-source-id="${id}"]`)).toHaveFocus()
      expect(container.querySelectorAll('[data-selected]')).toHaveLength(1)
      rerender(<EvidenceExplorer {...input('S3')} />)
      expect(container.querySelectorAll('[data-selected]')).toHaveLength(0)
    },
  )

  it('focuses cited rules and supports native reference navigation', () => {
    const props = input()
    const id = props.rules[0].id
    const { container } = render(<EvidenceExplorer {...props} selection={{ evidenceIds: [], ruleIds: [id] }} />)
    expect(container.querySelector(`[data-source-id="${id}"]`)).toHaveFocus()
    fireEvent.click(screen.getByRole('link', { name: /^F-PASS:/ }))
    expect(container.querySelector('[data-source-id="F-PASS"]')).toHaveFocus()
  })

  it.each(['unknown', 'hidden'] as const)('does not reveal or replace an %s citation', mode => {
    const props = input()
    const id = mode === 'hidden' ? 'F-PASS' : 'invented-source'
    render(<EvidenceExplorer {...props} visibleFacts={[]} selection={{ evidenceIds: [id], ruleIds: [] }} />)
    expect(screen.getByRole('alert')).toHaveTextContent(`Reference unavailable or not yet revealed: ${id}`)
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(screen.queryByText('Pass-time observation exists')).not.toBeInTheDocument()
  })

  it.each(['javascript:alert(1)', 'http://www.theifab.com', 'data:text/html,unsafe', '//www.theifab.com', 'https://name:password@www.theifab.com'])(
    'does not make unsafe source %s actionable', url => {
      const props = input()
      render(<EvidenceExplorer {...props} rules={[{ ...props.rules[0], url, title: '<img src=x onerror=alert(1)>' }]} />)
      expect(screen.queryByRole('link', { name: 'Primary source (opens new tab)' })).not.toBeInTheDocument()
      expect(screen.getByText(/a safe HTTPS reference is required/)).toBeVisible()
      expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible()
      expect(document.querySelector('img')).toBeNull()
    },
  )

  it('shows source-checked and unresolved metadata without upgrading either to expert approval', () => {
    const props = input()
    render(<EvidenceExplorer {...props} rules={[
      { ...props.rules[0], reviewStatus: 'SOURCE_CHECKED', checkedOn: '2026-10-22' },
      { ...props.rules[0], id: 'R-DRAFT', edition: null, checkedOn: null },
    ]} />)
    expect(screen.getByText(/Source checked · not expert-reviewed/)).toBeVisible()
    expect(screen.getByText(/Edition: unavailable/)).toBeVisible()
  })
})
