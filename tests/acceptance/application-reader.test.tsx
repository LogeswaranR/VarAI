import { ExplanationReader } from '../../client/src/explanation-view/ExplanationReader'
import { registerReaderChecks } from './reader-checks'

registerReaderChecks('Real VAR-106 reader with explicitly injected contract fixtures (no provider)', {
  explanation: ExplanationReader,
})
