import base from '../../client/eslint.config.js'
import globals from 'globals'

export default [
  ...base,
  { ignores: ['tests/acceptance/artifacts/**', 'tests/acceptance/.cache/**'] },
  {
    files: ['tests/acceptance/**/*.{ts,tsx,mts,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
]
