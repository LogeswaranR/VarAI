import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fixture } from '../harness/fixtures'
import { UI_HOOKS } from '../contracts/ui-hooks'
import { Scene } from './Scene'

describe('VAR-103 supplied scene', () => {
  it.each(['S1', 'S2'] as const)('renders %s using supplied coordinates and text, without a calculated verdict', id => {
    const scenario = fixture(id)
    const before = structuredClone(scenario)
    const { container } = render(<Scene diagram={scenario.diagram} visibleFacts={scenario.facts} reviewReady={false} />)
    expect(screen.getByText('Synthetic · illustrative snapshot')).toBeVisible()
    expect(screen.getByRole('img')).toHaveAccessibleDescription(scenario.diagram.textAlternative)
    expect(screen.getByTestId('positional-reference')).toHaveAttribute('x1', `${5 + scenario.diagram.secondLastReferenceX! * 0.9}`)
    const receiver = scenario.diagram.markers.find(marker => marker.role === 'RECEIVER')!
    expect(container.querySelector('[data-marker-role="RECEIVER"]')).toHaveAttribute('transform', `translate(${5 + receiver.x * 0.9} ${5 + receiver.y * 0.58})`)
    expect(container.querySelectorAll('[data-marker-role]')).toHaveLength(scenario.diagram.markers.length)
    expect(screen.queryByText(/Goal (disallowed|confirmed)/)).not.toBeInTheDocument()
    expect(scenario).toEqual(before)
  })

  it('withholds a raw diagram, labels and positional text until all position facts are released', () => {
    const scenario = fixture('S1')
    const { container, rerender } = render(<Scene diagram={scenario.diagram} visibleFacts={[]} reviewReady={false} />)
    expect(screen.getByText(/Not yet revealed:/, { selector: 'p' })).toBeVisible()
    expect(container.querySelector('[data-marker-role]')).toBeNull()
    expect(screen.queryByTestId('positional-reference')).not.toBeInTheDocument()
    expect(screen.queryByText(scenario.diagram.textAlternative)).not.toBeInTheDocument()
    expect(screen.queryByTestId(UI_HOOKS.missingSnapshot)).not.toBeInTheDocument()
    rerender(<Scene diagram={scenario.diagram} visibleFacts={scenario.facts.filter(fact => fact.key !== 'PASS_TIME_OBSERVED')} reviewReady={true} />)
    expect(container.querySelector('[data-marker-role]')).toBeNull()
  })

  it('S3 has no invented receiver or reference line even when ready', () => {
    const scenario = fixture('S3')
    const { container } = render(<Scene diagram={scenario.diagram} visibleFacts={scenario.facts} reviewReady={true} />)
    expect(screen.getByTestId(UI_HOOKS.missingSnapshot)).toBeVisible()
    expect(container.querySelector('[data-marker-role]')).toBeNull()
    expect(screen.queryByTestId('positional-reference')).not.toBeInTheDocument()
  })
})
