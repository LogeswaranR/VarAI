// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { checks } from './model'

describe('draft evaluation pack integrity — no performed study or expert review', () => {
  it('maps exactly BR-01..BR-10 and all nine assigned criteria', async () => {
    const text = await readFile('docs/evaluation/traceability.md', 'utf8')
    const requirements = Array.from({ length: 10 }, (_, index) => `BR-${String(index + 1).padStart(2, '0')}`)
    expect([...text.matchAll(/^\| (BR-\d{2}) \|/gm)].map(match => match[1])).toEqual(requirements)
    expect([...new Set(checks.flatMap(check => check.requirements))].sort()).toEqual(requirements)
    expect([...text.matchAll(/^\| (VAR-108(?:-T0[12])?-AC[1-5]) \|/gm)].map(match => match[1])).toEqual([
      'VAR-108-AC1', 'VAR-108-AC2', 'VAR-108-AC3', 'VAR-108-AC4', 'VAR-108-AC5',
      'VAR-108-T01-AC1', 'VAR-108-T01-AC2', 'VAR-108-T02-AC1', 'VAR-108-T02-AC2',
    ])
  })

  it('contains five counterbalanced planned rows with no fabricated scores or consent', async () => {
    const text = await readFile('docs/evaluation/measurements.csv', 'utf8')
    const [header, ...rows] = text.trim().split('\n').map(row => row.split(','))
    expect(header).toHaveLength(16)
    expect(rows).toHaveLength(5)
    expect(rows.map(row => row[0])).toEqual(['P01', 'P02', 'P03', 'P04', 'P05'])
    for (const row of rows) {
      expect(row).toHaveLength(header.length)
      expect([row[1], row[2], row.at(-1)]).toEqual(['NOT_RUN', 'NOT_RUN', 'NOT_RUN'])
      expect(row.slice(6, -1).every(value => value === '')).toBe(true)
      expect([row[4], row[5]].sort()).toEqual(['A', 'B'])
    }
    expect(rows.filter(row => row[3] === 'TEXT_THEN_INTERACTIVE')).toHaveLength(3)
    expect(rows.filter(row => row[3] === 'INTERACTIVE_THEN_TEXT')).toHaveLength(2)
  })

  it('labels original examples and proposed human results as unperformed drafts', async () => {
    const study = await readFile('docs/evaluation/study-pack.md', 'utf8')
    expect([...study.matchAll(/^\| ([AB][1-3]) \|/gm)].map(match => match[1])).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3'])
    expect(study).toContain('**C1:**')
    expect(study).toContain('**C2:**')
    expect(study).toContain('Study NOT RUN')
    for (const file of ['semantic-rubric.md', 'qualified-review.md']) {
      const text = await readFile(`docs/evaluation/${file}`, 'utf8')
      expect(text).toContain('DRAFT')
      expect(text).toContain('NOT RUN')
    }
  })
})
