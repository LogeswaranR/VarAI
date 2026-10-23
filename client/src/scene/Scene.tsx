import { useId } from 'react'
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

export function Scene({ diagram, visibleFacts }: SceneInput) {
  const titleId = useId()
  const descriptionId = useId()
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
      <svg viewBox="0 0 100 68" role="img" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <title id={titleId}>{available ? 'Supplied pass-time positions' : 'Pass-time positions unavailable'}</title>
        <desc id={descriptionId}>{description}</desc>
        <rect className="pitch" x="1" y="1" width="98" height="66" rx="2" />
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
      </svg>
      <p className="scene-direction">Attacking direction: left → right</p>
      <p data-testid={revealed && !available ? UI_HOOKS.missingSnapshot : undefined}>{description}</p>
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
