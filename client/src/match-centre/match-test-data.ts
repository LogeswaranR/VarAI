import { MATCH_ID } from './match-model'
import type { MatchEvent, MatchMetadata, MatchPlayer, MatchTeam, MomentumSample, OverlayCue } from './match-model'

const roles = ['GK', 'RB', 'LB', 'CB', 'CB', 'DM', 'RW', 'CM', 'ST', 'AM', 'LW']

function team(teamId: string, name: string, shortName: string, attackDirection: string, names: Record<number, string>): MatchTeam {
  const players: MatchPlayer[] = roles.map((role, index) => ({
    playerId: `${teamId}-${String(index + 1).padStart(2, '0')}`,
    name: names[index + 1] ?? `Player ${index + 1}`,
    shirtNumber: index + 1,
    role,
  }))
  return { teamId, name, shortName, attackDirection, players }
}

export const metadata: MatchMetadata = {
  matchId: MATCH_ID,
  pitch: { lengthM: 105, widthM: 68 },
  periods: [{ period: 1, startMs: 0, endMs: 2_700_000 }, { period: 2, startMs: 2_700_000, endMs: 5_520_000 }],
  durationMs: 5_520_000,
  startingScore: { home: 0, away: 0 },
  homeTeam: team('COMETS', 'Alder Vale Comets', 'AVC', 'LEFT_TO_RIGHT', { 7: 'Jasper Quill', 9: 'Ravi Sorrell' }),
  awayTeam: team('LANTERNS', 'Brindle Reach Lanterns', 'BRL', 'RIGHT_TO_LEFT', { 6: 'Tarn Delacroix', 9: 'Zane Ostrander' }),
  highlights: [
    { highlightId: 'HL-01', label: '67:21 · AVC goal, ruled out on review', matchClockMs: 4_011_000 },
    { highlightId: 'HL-02', label: '88:10 · AVC goal (1–1)', matchClockMs: 5_260_400 },
  ],
  seed: 20261023,
  synthetic: true,
}

let sequence = 0

export function resetSequence() {
  sequence = 0
}

export function event(overrides: Partial<MatchEvent> = {}): MatchEvent {
  sequence += 1
  return {
    eventId: `${MATCH_ID}-E${String(sequence).padStart(4, '0')}`,
    matchId: MATCH_ID,
    sequence,
    period: 2,
    matchClockMs: 4_000_000 + sequence * 1000,
    teamId: 'COMETS',
    playerId: 'COMETS-09',
    eventType: 'PASS',
    x: 60,
    y: 30,
    endX: 70,
    endY: 34,
    durationMs: 900,
    outcome: 'COMPLETE',
    receiverId: 'COMETS-07',
    scoreAfter: null,
    scenarioId: null,
    metrics: {
      distanceM: 10.8, forwardM: 10, speedMps: 12, speedKph: 43.2, difficulty: 40,
      underPressure: false, finalThird: false, sprint: null,
    },
    description: 'Ravi Sorrell passes to Jasper Quill.',
    synthetic: true,
    ...overrides,
  }
}

export function cue(overrides: Partial<OverlayCue> = {}): OverlayCue {
  return {
    schemaVersion: '1.0',
    overlayId: `${MATCH_ID}-OV-001`,
    matchId: MATCH_ID,
    kind: 'HARD_PASS',
    priority: 2,
    inMs: 4_000_000,
    outMs: 4_007_000,
    durationMs: 7000,
    headline: 'Jasper Quill completes a difficult pass to Ravi Sorrell',
    detail: '27 m pass, 22.8 m forward, under pressure: difficulty 92/100.',
    whyItMatters: 'Difficulty 92/100. Score AVC 0–0 BRL, with 22 minutes left.',
    lowerThird: { title: 'JASPER QUILL · #7', subtitle: 'Pass difficulty 92/100 · 27 m' },
    metrics: [{ key: 'difficulty', label: 'Pass difficulty', value: 92, unit: '/100' }],
    teamId: 'COMETS',
    playerIds: ['COMETS-07', 'COMETS-09'],
    sourceEventIds: [`${MATCH_ID}-E0001`],
    sourceWindow: null,
    rule: 'HARD_PASS v1: completed pass with difficulty of at least 90/100.',
    scenarioId: null,
    synthetic: true,
    ...overrides,
  }
}

export function momentum(overrides: Partial<MomentumSample> = {}): MomentumSample {
  return {
    minute: 67, matchClockMs: 4_020_000, windowSeconds: 300, homeBallActionSharePct: 71.4, controlIndex: 43,
    turnovers: 6, turnoversPerMinute: 1.2, homePressures: 12, awayPressures: 20, state: 'CONTROL',
    controllingTeamId: 'COMETS', ...overrides,
  }
}

export function envelope(type: string, payload: unknown, schemaVersion = '2.0') {
  return JSON.stringify({ schemaVersion, type, payload })
}
