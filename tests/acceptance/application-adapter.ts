import { createHttpClients } from '../../client/src/transport/graphql'
import type { AcceptanceAdapter } from './model'

export async function createAdapter(): Promise<AcceptanceAdapter> {
  const origin = new URL(process.env.VARAI_APPLICATION_URL ?? '')
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || origin.port === '4173' ||
    origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Use an explicitly owned loopback application origin, never the canonical preview.')
  }
  const health = await fetch(new URL('/health', origin), { redirect: 'error' })
  const body = await health.json()
  if (!health.ok || body.stage !== 'local-review' || body.schemaVersion !== '0.2') {
    throw new Error('The supplied origin is not the running G01 application.')
  }
  return {
    kind: 'real-application',
    name: 'Published VarAI .NET application over /graphql (real repository/service; live explicitly disabled)',
    application: { available: true },
    live: { available: false, reason: 'NOT RUN: provider access and paid smoke are not authorised; the local host explicitly disables provider configuration.' },
    ...createHttpClients(new URL('/graphql', origin).href),
  }
}
