import { probeSlots } from '../../client/src/harness/fixtures'
import { registerReaderChecks } from './reader-checks'

registerReaderChecks('VAR-108 fixture-context lifecycle — baseline probe, not production replay/reader acceptance', probeSlots('VAR-106'))
