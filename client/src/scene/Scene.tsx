import { Component, lazy, Suspense, useCallback, useId, useState } from 'react'
import type { ReactNode } from 'react'
import type { SceneInput } from '../contracts/interfaces'
import type { FactKey, MarkerRole } from '../contracts/graphql.generated'
import { UI_HOOKS } from '../contracts/ui-hooks'
import './scene.css'

const positionKeys: readonly FactKey[] = [
  'PASS_TIME_OBSERVED', 'RECEIVER_IN_OPPONENTS_HALF', 'RECEIVER_AHEAD_OF_BALL', 'RECEIVER_VS_SECOND_LAST',
]
const symbols: Record<MarkerRole, string> = { PASSER: '●', RECEIVER: '▲', OPPONENT: '■', BALL: '○' }
const pitchX = (x: number) => 5 + x * 0.9
const pitchY = (y: number) => 5 + y * 0.58
const Scene3D = lazy(() => import('./Scene3D'))

class PitchBoundary extends Component<{
  children: ReactNode
  onUnavailable: (message: string) => void
}, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) {
    console.error('VarAI could not load the 3D pitch.', error)
    this.props.onUnavailable('The 3D view could not load. Showing the supplied 2D diagram instead.')
  }
  render() { return this.state.failed ? null : this.props.children }
}

export function Scene({ diagram, visibleFacts }: SceneInput) {
  const titleId = useId()
  const descriptionId = useId()
  const stripeId = useId()
  const [mode, setMode] = useState<'3d' | '2d'>(() => typeof WebGL2RenderingContext === 'undefined' ? '2d' : '3d')
  const [unavailable, setUnavailable] = useState<string | null>(() => typeof WebGL2RenderingContext === 'undefined'
    ? '3D is unavailable in this browser. Showing the supplied 2D diagram instead.' : null)
  const showFallback = useCallback((message: string) => {
    setUnavailable(message)
    setMode('2d')
  }, [])
  const revealed = positionKeys.every(key => visibleFacts.some(fact => fact.key === key))
  const available = revealed && diagram.status === 'ILLUSTRATIVE'
  const description = revealed ? diagram.textAlternative
    : 'Not yet revealed: play the replay to release the supplied pass-time position facts.'
  return (
    <figure className="scene" data-testid={UI_HOOKS.scenePanel}>
      <figcaption>
        <strong>Synthetic · illustrative snapshot</strong>
        <span>Not footage, tracking evidence or a measured reconstruction.</span>
      </figcaption>
      <div className="scene-toolbar" role="group" aria-label="Pitch view">
        <button type="button" aria-pressed={mode === '3d'} disabled={unavailable !== null} onClick={() => setMode('3d')}>3D pitch</button>
        <button type="button" aria-pressed={mode === '2d'} onClick={() => setMode('2d')}>2D diagram</button>
        <span>Static supplied positions</span>
      </div>
      {unavailable && <p className="scene-fallback" aria-live="polite">{unavailable}</p>}
      <span className="scene-accessible" id={titleId}>{available ? 'Supplied pass-time positions' : 'Pass-time positions unavailable'}</span>
      <span className="scene-accessible" id={descriptionId}>{description}</span>
      <div className="scene-viewport" role="img" aria-labelledby={titleId} aria-describedby={descriptionId}>
        {mode === '3d' ? <PitchBoundary onUnavailable={showFallback}>
          <Suspense fallback={<p className="scene-loading">Preparing the 3D pitch…</p>}>
            <Scene3D diagram={available ? diagram : null} onUnavailable={showFallback} />
          </Suspense>
        </PitchBoundary> : <svg viewBox="0 0 100 68" aria-hidden="true">
        <defs>
          <pattern id={stripeId} width="18" height="68" patternUnits="userSpaceOnUse">
            <rect width="9" height="68" fill="#ffffff" opacity="0.035" />
          </pattern>
        </defs>
        <rect className="pitch" x="1" y="1" width="98" height="66" rx="2" />
        <rect x="1" y="1" width="98" height="66" rx="2" fill={`url(#${stripeId})`} />
        <g className="pitch-lines" aria-hidden="true">
          <rect x="5" y="5" width="90" height="58" />
          <line x1="50" y1="5" x2="50" y2="63" />
          <circle cx="50" cy="34" r="9" />
          <path d="M5 18H18V50H5 M95 18H82V50H95 M5 27H10V41H5 M95 27H90V41H95" />
        </g>
        {available && <>
          {diagram.secondLastReferenceX !== null &&
            <line className="position-reference" data-testid="positional-reference"
              x1={pitchX(diagram.secondLastReferenceX)} x2={pitchX(diagram.secondLastReferenceX)} y1="5" y2="63">
              <title>Supplied second-last-opponent reference, not a measured offside line</title>
            </line>}
          {diagram.markers.map((marker, index) => (
            <g key={marker.id} transform={`translate(${pitchX(marker.x)} ${pitchY(marker.y)})`}
              className={`scene-marker marker-${marker.role.toLowerCase()}`} data-marker-role={marker.role}>
              <title>{marker.label}</title>
              {marker.role === 'RECEIVER' ? <path d="M0 -3.4L3.4 2.7H-3.4Z" />
                : marker.role === 'OPPONENT' ? <rect x="-2.6" y="-2.6" width="5.2" height="5.2" />
                  : <circle r={marker.role === 'BALL' ? '1.6' : '2.8'} />}
              <text x="0" y="-5" textAnchor="middle" aria-hidden="true">{index + 1}</text>
            </g>
          ))}
        </>}
        </svg>}
        {!available && <div className="scene-waiting" aria-hidden="true">
          <span className="scene-waiting-icon">+</span>
          <strong>{revealed ? 'Position evidence unavailable' : 'The moment is waiting'}</strong>
          <span>{revealed ? 'No player positions are inferred.' : 'Press Play to reveal the supplied snapshot.'}</span>
        </div>}
      </div>
      <p className="scene-direction">Attacking direction: left → right</p>
      <p className="scene-description" data-testid={revealed && !available ? UI_HOOKS.missingSnapshot : undefined}>{description}</p>
      {available && <>
        <p className="scene-reference">Dashed reference: supplied second-last opponent. No ruling or distance is calculated.</p>
        <ol className="scene-legend" aria-label="Supplied markers">
          {diagram.markers.map(marker => <li key={marker.id}>
            <span aria-hidden="true">{symbols[marker.role]} </span>{marker.label}
          </li>)}
        </ol>
      </>}
    </figure>
  )
}
