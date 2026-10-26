import { expect, test } from '@playwright/test'
import type { Readable } from 'node:stream'

test.skip(process.env.VARAI_GATED_SERVER !== '1', 'Runs under playwright.gated.config.ts, which starts the server with a 6 s decision window.')

const WINDOW_SECONDS = 6
const LOG_LINK = 'Download decision log (JSONL)'
const FALLBACK_NOTICE = 'Tamil unavailable - showing English (reason: AI narration is off)'
const OVERRIDE_NOTE = 'Tamil wording supplied by the desk'

// Plain Tamil without digits, Latin letters or markup, so nothing in it can trip the server's text rules.
const tamilEdit = {
  'Tamil Headline': 'போட்டியின் கட்டுப்பாடு மாறுகிறது',
  'Tamil Fan': 'ஆட்டம் மீண்டும் சமநிலைக்கு வந்தது.',
  'Tamil Analyst': 'இது ஒரு முக்கிய தருணம்.',
  'Tamil Why it matters': 'முடிவு நெருங்குகிறது.',
}

async function readAll(stream: Readable | null) {
  if (!stream) throw new Error('The download had no content.')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

test('Preview mode still has no approval interface and no narration', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Playback options & guide', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Match centre', level: 1 })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Preview/ })).toBeChecked()
  await expect(page.getByTestId('mode-note')).toHaveText('Preview - deterministic rules only, not operator-approved')
  await expect(page.getByTestId('provenance')).toContainText('No AI model is called here')
  await expect(page.getByRole('heading', { name: 'Operator desk' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: LOG_LINK })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Jump to 66:00' })).toHaveCount(0)
  await page.getByText('Personalise', { exact: false }).click()
  await expect(page.getByRole('radio', { name: 'தமிழ்' })).toBeDisabled()
  await expect(page.getByText('Tamil narration is available in operator-gated mode')).toBeVisible()

  await page.getByLabel('Speed').selectOption('600')
  await page.getByRole('button', { name: /88:10 · AVC goal \(1–1\)/ }).click()
  await expect(page.getByTestId('match-status')).toContainText('Full time', { timeout: 30_000 })
  await expect(page.getByTestId('moment-card').first()).toBeVisible()
  await expect(page.getByTestId('provenance-chip')).toHaveCount(0)
  await expect(page.getByTestId('language-notice')).toHaveCount(0)
  await expect(page.getByTestId('operator-desk')).toHaveCount(0)
})

test('Operator-gated mode: approve one cue, override another in Tamil, leave the rest undecided and download the log', async ({ page }) => {
  const problems: string[] = []
  page.on('pageerror', error => problems.push(`page error: ${error.message}`))
  page.on('console', message => { if (message.type() === 'error') problems.push(`console error: ${message.text()}`) })

  await page.goto('/')
  await page.getByText('Personalise', { exact: false }).click()
  await page.getByText('Playback options & guide', { exact: true }).click()
  await page.getByRole('radio', { name: /Operator-gated/ }).check()
  await expect(page.getByTestId('narration-status')).toHaveText('AI narration: off - deterministic English only')
  await expect(page.getByTestId('mode-note')).toContainText('(20 s)')
  await expect(page.getByRole('heading', { name: 'Operator desk', level: 2 })).toBeVisible()
  await expect(page.getByLabel('Speed')).toHaveValue('10')
  await expect(page.getByRole('radio', { name: 'தமிழ்' })).toBeEnabled()

  const goal = page.getByRole('article', { name: /^Goal · 88:11/ })
  const hardPass = page.getByRole('article', { name: /^Pass quality · 88:09/ })
  const proposal = (approvalId: string) => page.locator(`[data-testid="desk-proposal"][data-approval-id="${approvalId}"]`)

  await test.step('start a session a few seconds before the 88:10 goal', async () => {
    await page.getByRole('button', { name: /88:10 · AVC goal \(1–1\)/ }).click()
    await expect(page.getByTestId('mode-note')).toContainText(`The program is delayed by the decision window (${WINDOW_SECONDS} s).`)
    await expect(page.getByTestId('match-status')).toContainText('Operator-gated')
  })

  await test.step('the desk proposes both cues with a countdown and both languages, and says Tamil is the English fallback', async () => {
    await expect(goal).toBeVisible()
    await expect(hardPass).toBeVisible()
    await expect(goal.getByTestId('countdown')).toContainText(/\d+ s left to decide|Window closed/)
    await expect(goal.getByRole('region', { name: 'English narration' })).toContainText('Goal for Alder Vale Comets: Ravi Sorrell')
    await expect(goal.getByRole('region', { name: 'Tamil narration' }).getByTestId('language-notice')).toHaveText(FALLBACK_NOTICE)
    await expect(goal.getByTestId('verification')).toHaveCount(2)
    await expect(goal.getByText('No mechanical checks ran')).toHaveCount(2)
    await expect(goal.getByText(/Mechanical checks only \(numbers, scores, names, event words, script\)\. They do not prove the text is true\./)).toHaveCount(2)
    await expect(page.getByTestId('model-usage')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  })

  await test.step('approve the goal before its window closes', async () => {
    await goal.getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByTestId('desk-outcome')).toContainText('approved. It airs when its time comes.')
    await expect(proposal('APR-002')).toHaveAttribute('data-state', 'APPROVED')
    await expect(proposal('APR-002').getByTestId('proposal-state')).toHaveText('Approved')
  })

  await test.step('the program airs the approved cue with its provenance', async () => {
    const lowerThird = page.getByTestId('lower-third')
    await expect(lowerThird).toContainText('GOAL · AVC', { timeout: 15_000 })
    await expect(lowerThird.getByTestId('provenance-chip')).toHaveText('Deterministic text')
    const cards = page.getByTestId('moment-card')
    await expect(cards).toHaveCount(1)
    await expect(cards.first().getByRole('heading', { name: 'Goal for Alder Vale Comets: Ravi Sorrell' })).toBeVisible()
    await expect(cards.first().getByTestId('provenance-chip')).toHaveText('Deterministic text')
  })

  await test.step('switching to Tamil shows the English fallback label', async () => {
    await page.getByRole('radio', { name: 'தமிழ்' }).check()
    const card = page.getByTestId('moment-card').first()
    await expect(card.getByTestId('language-notice')).toHaveText(FALLBACK_NOTICE)
    await expect(card.getByRole('heading', { name: 'Goal for Alder Vale Comets: Ravi Sorrell' })).toHaveAttribute('lang', 'en')
    await expect(card.getByTestId('provenance-chip')).toHaveText('Deterministic text')
  })

  await test.step('the cue nobody decided is held automatically and never reaches the program', async () => {
    await expect(proposal('APR-001')).toHaveAttribute('data-state', 'AUTO_HELD', { timeout: 15_000 })
    await expect(proposal('APR-001').getByTestId('proposal-state')).toHaveText('Held automatically: no decision in time')
    await expect(page.getByTestId('moment-card')).toHaveCount(1)
    await expect(page.getByTestId('moment-card').filter({ hasText: /difficult pass/i })).toHaveCount(0)
  })

  await test.step('override a later cue with Tamil wording written by the operator', async () => {
    const swing = proposal('APR-004')
    await expect(swing).toBeVisible({ timeout: 30_000 })
    await swing.getByRole('button', { name: 'Override' }).click()
    for (const [name, text] of Object.entries(tamilEdit)) await swing.getByRole('textbox', { name }).fill(text)
    await swing.getByRole('textbox', { name: 'Note (optional)' }).fill(OVERRIDE_NOTE)
    await swing.getByRole('button', { name: 'Save override' }).click()
    await expect(page.getByTestId('desk-outcome')).toContainText('APR-004 overridden with your edits.')
    await expect(swing).toHaveAttribute('data-state', 'OVERRIDDEN')
    await expect(swing.getByTestId('proposal-state')).toHaveText('Overridden')
    const sources = swing.getByRole('list', { name: 'Narration sources and checks' })
    await expect(sources).toContainText('Operator-edited')
    await expect(sources).toContainText('Deterministic fallback (reason: AI narration is off)')
    await expect(swing.getByTestId('verification-chip').first()).toHaveText(/Mechanical checks passed|Checks flagged|No mechanical checks ran/)
  })

  await test.step('the program airs the operator-edited Tamil, while English stays deterministic text', async () => {
    const cards = page.getByTestId('moment-card')
    await expect(cards).toHaveCount(2, { timeout: 30_000 })
    const edited = cards.first()
    await expect(edited.getByTestId('provenance-chip')).toHaveText('Operator-edited')
    await expect(edited.getByRole('heading', { name: tamilEdit['Tamil Headline'] })).toHaveAttribute('lang', 'ta')
    await expect(edited.getByText(tamilEdit['Tamil Fan'])).toHaveAttribute('lang', 'ta')
    await expect(edited.getByTestId('language-notice')).toHaveCount(0)
    await expect(page.getByTestId('lower-third')).toContainText(tamilEdit['Tamil Headline'])
    await page.getByRole('radio', { name: 'English' }).check()
    await expect(cards.first().getByTestId('provenance-chip')).toHaveText('Deterministic text')
    await expect(cards.first().getByRole('heading', { name: 'Alder Vale Comets take control of the match' })).toHaveAttribute('lang', 'en')
    await expect(cards.first().getByTestId('language-notice')).toHaveCount(0)
  })

  await test.step('the run reaches full time with only the approved and the overridden cue in the program', async () => {
    await expect(page.getByTestId('match-status')).toContainText('Full time', { timeout: 45_000 })
    await expect(page.getByTestId('moment-card')).toHaveCount(2)
    await expect(page.locator('[data-testid="desk-proposal"][data-state="APPROVED"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="desk-proposal"][data-state="OVERRIDDEN"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="desk-proposal"][data-state="AUTO_HELD"]')).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Restart gated run' })).toBeEnabled()
  })

  await test.step('the decision log downloads as JSON lines that chain together and record the override verbatim', async () => {
    const downloading = page.waitForEvent('download')
    await page.getByRole('link', { name: LOG_LINK }).click()
    const file = await downloading
    expect(file.suggestedFilename()).toMatch(/^varai-decisions-[0-9a-f]{32}\.jsonl$/)
    const text = await readAll(await file.createReadStream())
    expect(text.endsWith('\n')).toBe(true)
    const entries = text.trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    expect(entries).toHaveLength(8)
    expect(entries.map(entry => entry.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    entries.forEach((entry, index) => {
      if (index > 0) expect(entry.prevHash).toBe(entries[index - 1].hash)
      expect(entry.actorAuthenticated).toBe(false)
    })
    expect(entries.filter(entry => entry.event === 'PROPOSED')).toHaveLength(4)
    expect(entries.find(entry => entry.event === 'APPROVED')).toMatchObject({ approvalId: 'APR-002', actor: 'operator', cueKind: 'GOAL' })
    const overridden = entries.find(entry => entry.event === 'OVERRIDDEN')
    expect(overridden).toMatchObject({
      approvalId: 'APR-004', actor: 'operator', note: OVERRIDE_NOTE,
      edits: { ta: { headline: tamilEdit['Tamil Headline'], fan: tamilEdit['Tamil Fan'], analyst: tamilEdit['Tamil Analyst'], why: tamilEdit['Tamil Why it matters'] } },
    })
    expect(overridden?.editedPayloadHash).toMatch(/^[0-9a-f]{64}$/)
    expect(overridden?.editedPayloadHash).not.toBe(overridden?.payloadHash)
    expect(overridden?.edits).not.toHaveProperty('en')
    const held = entries.filter(entry => entry.event === 'AUTO_HELD')
    expect(held.map(entry => entry.approvalId)).toEqual(['APR-001', 'APR-003'])
    expect(held.every(entry => entry.actor === 'system' && entry.reason === 'SLA_EXPIRED')).toBe(true)
  })

  expect(problems).toEqual([])
})
