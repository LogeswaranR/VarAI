import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fixture } from '../harness/fixtures'
import type { ComparisonInput } from '../contracts/interfaces'
import { UI_HOOKS } from '../contracts/ui-hooks'
import { Comparison } from './Comparison'

function input(): ComparisonInput {
  return { scenarioId: 'S1', reviewReady: true, pair: [fixture('S1'), fixture('S2')], selectScenario: vi.fn() }
}

describe('VAR-107 curated comparison', () => {
  it('separates one independent fact from derived outcomes, selects and restores without mutation', () => {
    const props = input()
    const original = structuredClone(props.pair)
    const { rerender } = render(<Comparison {...props} />)
    expect(screen.getByText('Curated hypothetical')).toBeVisible()
    expect(screen.getByText('One independent fact changes')).toBeVisible()
    expect(screen.getByText(/derived differences, not extra edited evidence/)).toBeVisible()
    fireEvent.click(screen.getByTestId(UI_HOOKS.comparisonToggle))
    expect(props.selectScenario).toHaveBeenLastCalledWith('S2')
    rerender(<Comparison {...props} scenarioId="S2" />)
    fireEvent.click(screen.getByRole('button', { name: 'Restore S1 · nearer position' }))
    expect(props.selectScenario).toHaveBeenLastCalledWith('S1')
    expect(props.pair).toEqual(original)
  })

  it.each(['S3', 'not-ready', 'other-pair', 'extra-fact', 'context', 'rule', 'version'] as const)(
    'withholds comparison for %s', invalid => {
      const props = input()
      let second = fixture('S2')
      if (invalid === 'other-pair') second = fixture('S3')
      if (invalid === 'extra-fact') second = { ...second, facts: second.facts.map((fact, index) =>
        index === 0 ? { ...fact, value: { __typename: 'BooleanFactValue', boolean: false } } : fact) }
      if (invalid === 'context') second = { ...second, match: { ...second.match, homeTeam: 'Different supplied team' } }
      if (invalid === 'rule') second = { ...second, rules: second.rules.map((rule, index) =>
        index === 0 ? { ...rule, summary: `${rule.summary} Different summary.` } : rule) }
      if (invalid === 'version') second = { ...second, contentVersion: 'different' }
      render(<Comparison {...props} pair={[props.pair[0], second]} scenarioId={invalid === 'S3' ? 'S3' : 'S1'} reviewReady={invalid !== 'not-ready'} />)
      expect(screen.getByTestId(UI_HOOKS.comparisonUnavailable)).toBeVisible()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(props.selectScenario).not.toHaveBeenCalled()
    },
  )
})
