import { fileURLToPath } from 'node:url'
import { mergeConfig, normalizePath } from 'vite'
import sharedConfig from '../../vite.config.ts'

const worktree = normalizePath(fileURLToPath(new URL('../../../', import.meta.url))).replace(/\/$/, '')

// Test/preview only: the assigned worktree itself lives inside an enclosing .git directory.
export default mergeConfig(sharedConfig, {
  root: fileURLToPath(new URL('../../', import.meta.url)),
  server: {
    fs: {
      strict: true,
      allow: [worktree],
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc',
        '.yarnrc.yml',
        `${worktree}/.git`,
        `${worktree}/**/.git`,
        `${worktree}/**/.git/**`,
      ],
    },
  },
})
