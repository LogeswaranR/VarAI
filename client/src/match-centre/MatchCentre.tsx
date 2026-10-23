import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchMatchMetadata, matchStreamClient } from './match-stream'
import type { MatchStreamClient } from './match-stream'
import { defaultGateClient } from './gate-api'
import type { GateClient } from './gate-api'
import { DEFAULT_GATED_SPEED, GATED_SPEEDS } from './gate-model'
import type { PlaybackMode } from './gate-model'
import { introText, provenanceParagraphs } from './match-copy'
import { speedChoices } from './match-format'
import type { MatchMetadata } from './match-model'
import { recentEvents } from './match-selectors'
import type { NarrationLanguage } from './narration-model'
import { browserStorage, languageOf, loadProfile, resolveProfile, saveProfile } from './profile'
import type { AudienceProfile, Persona, StorageLike } from './profile'
import { useGatedSession } from './useGatedSession'
import { useMatchStream } from './useMatchStream'
import { browserClock } from './useNow'
import { BroadcastFrame, EVENT_MAP_WINDOW_MS } from './BroadcastFrame'
import { MatchControls } from './MatchControls'
import { MomentFeed } from './MomentFeed'
import { MomentumPanel } from './MomentumPanel'
import { OnAirPanel } from './OnAirPanel'
import { OperatorDesk } from './OperatorDesk'
import { PlayerFocus } from './PlayerFocus'
import { ProfileBar } from './ProfileBar'
import { StudioPanel } from './StudioPanel'
import { RawFeed, TeamStatsPanel } from './TeamStatsPanel'
import './match-centre.css'

export interface MatchCentreProps {
  readonly streamClient?: MatchStreamClient
  readonly gateClient?: GateClient
  readonly loadMetadata?: (signal: AbortSignal) => Promise<MatchMetadata>
  readonly storage?: StorageLike | null
  /** A monotonic millisecond clock; replaced in tests to drive the decision countdown. */
  readonly clock?: () => number
}

export function MatchCentre({
  streamClient = matchStreamClient, gateClient = defaultGateClient, loadMetadata = fetchMatchMetadata, storage = browserStorage(),
  clock = browserClock,
}: MatchCentreProps) {
  const { state, speed, start, prepare, fail, stop, reset, setMetadata } = useMatchStream(streamClient)
  const [mode, setMode] = useState<PlaybackMode>('preview')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [profile, setProfile] = useState<AudienceProfile>(() => loadProfile(storage))
  const [speedChoice, setSpeedChoice] = useState(60)
  const [gatedSpeed, setGatedSpeed] = useState(DEFAULT_GATED_SPEED)
  const [highlightIds, setHighlightIds] = useState<readonly string[]>([])
  const gated = mode === 'gated'
  const gate = useGatedSession({
    gate: gateClient, clock, active: gated, programStatus: state.status,
    prepareProgram: prepare, startProgram: start, failProgram: fail, stopProgram: stop,
  })
  const { start: startGated, stop: stopGated, reset: resetGated } = gate

  useEffect(() => {
    const controller = new AbortController()
    loadMetadata(controller.signal).then(setMetadata, error => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'The match could not be loaded.')
    })
    return () => controller.abort()
  }, [loadMetadata, setMetadata])

  const metadata = state.metadata
  const resolved = metadata ? resolveProfile(profile, metadata) : profile
  const language = languageOf(resolved)
  const update = (next: AudienceProfile) => {
    setProfile(next)
    saveProfile(storage, next)
  }
  const changePersona = (persona: Persona) => update({ ...resolved, persona })
  const changePlayer = (playerId: string) => update({ ...resolved, playerId })
  const changeLanguage = (next: NarrationLanguage) => update({ ...resolved, language: next })
  const changeClub = (clubId: string) => {
    const club = [metadata?.homeTeam, metadata?.awayTeam].find(team => team?.teamId === clubId)
    const striker = club?.players.find(player => player.role === 'ST') ?? club?.players[0]
    update({ ...resolved, clubId, playerId: striker?.playerId ?? resolved.playerId })
  }
  // A run belongs to one mode: leaving it closes its streams and clears what it showed, so preview cues never appear in a gated run or the reverse.
  const changeMode = (next: PlaybackMode) => {
    if (next === mode) return
    resetGated()
    reset()
    setHighlightIds([])
    setMode(next)
  }
  const begin = useCallback((fromSeconds: number) => {
    setHighlightIds([])
    if (gated) void startGated({ speed: gatedSpeed, fromSeconds })
    else start({ speed: speedChoice, fromSeconds })
  }, [gated, gatedSpeed, speedChoice, start, startGated])

  const recent = useMemo(() => recentEvents(state.events, state.clockMs, EVENT_MAP_WINDOW_MS), [state.events, state.clockMs])
  const highlighted = useMemo(
    () => state.events.filter(item => highlightIds.includes(item.eventId)), [state.events, highlightIds])
  const goals = useMemo(() => state.events.filter(item => item.eventType === 'GOAL'), [state.events])

  return (
    <section className={`match-centre is-${resolved.persona}`} aria-label="Match centre">
      <header className="mc-hero">
        <p className="mc-eyebrow" data-testid="synthetic-badge">Synthetic match insights · generated, not real data</p>
        <h1>Match centre<span className="mc-dot" aria-hidden="true">.</span></h1>
        <p className="mc-intro">{introText(mode)}</p>
      </header>
      {loadError && <p className="mc-error" role="alert">{loadError}</p>}
      <ProfileBar metadata={metadata} profile={resolved} languageEnabled={gated} onPersona={changePersona} onClub={changeClub}
        onPlayer={changePlayer} onLanguage={changeLanguage} />
      <MatchControls metadata={metadata} status={state.status} clockMs={state.clockMs} speed={speed} message={state.message}
        speeds={gated ? GATED_SPEEDS : speedChoices} speedChoice={gated ? gatedSpeed : speedChoice} mode={mode}
        gated={{ session: gate.session, narration: gate.narration, narrationFailed: gate.narrationFailed }}
        onMode={changeMode} onSpeed={gated ? setGatedSpeed : setSpeedChoice} onStart={begin} onStop={gated ? stopGated : stop}
        onJump={ms => begin(Math.floor(ms / 1000))} />
      {gated && (
        <OperatorDesk variant={resolved.persona === 'studio' ? 'full' : 'compact'} desk={gate.desk} phase={gate.phase}
          logUrl={gate.logUrl} clock={clock} onDecide={gate.decide} onReconnect={gate.reconnectDesk} />
      )}
      {metadata
        ? <>
          <div className="mc-stage">
            <div className="mc-main">
              <BroadcastFrame metadata={metadata} recent={recent} highlighted={highlighted} clockMs={state.clockMs} score={state.score}
                cue={state.presented} status={state.status} clubId={resolved.clubId} speed={speed} gated={gated} language={language} />
              <MomentumPanel metadata={metadata} samples={state.momentum} goals={goals} persona={resolved.persona} />
            </div>
            <div className="mc-side">
              {resolved.persona === 'studio' && <OnAirPanel cue={state.presented} gated={gated} language={language} />}
              {resolved.persona === 'analyst' && <TeamStatsPanel metadata={metadata} events={state.events} />}
              {resolved.persona !== 'studio' &&
                <PlayerFocus metadata={metadata} events={state.events} cues={state.overlays} playerId={resolved.playerId} />}
            </div>
          </div>
          {resolved.persona === 'studio'
            ? <StudioPanel metadata={metadata} cues={state.overlays} onAirId={state.presented?.overlayId ?? null}
              clockMs={state.clockMs} speed={speed} gated={gated} language={language} />
            : <MomentFeed metadata={metadata} cues={state.overlays} persona={resolved.persona} clubId={resolved.clubId}
              playerId={resolved.playerId} gated={gated} language={language} onHighlight={setHighlightIds} />}
          {resolved.persona === 'analyst' && <RawFeed metadata={metadata} events={state.events} />}
        </>
        : !loadError && <p className="mc-empty">Loading the synthetic match…</p>}
      <div className="mc-provenance" data-testid="provenance">
        {provenanceParagraphs(mode, metadata?.seed ?? null, gate.narration).map(text => <p key={text}>{text}</p>)}
      </div>
    </section>
  )
}
