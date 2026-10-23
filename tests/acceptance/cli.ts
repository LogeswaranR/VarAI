import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createContractStubAdapter } from './adapters'
import { runAcceptance } from './harness'
import { exitCode } from './report'
import type { AcceptanceAdapter, Target } from './model'

export { createContractStubAdapter } from './adapters'
export { runAcceptance } from './harness'
export { validateReport } from './report'
export { validateBrowserReport } from './browser-report'

export async function main(args = process.argv.slice(2)) {
  try {
    let target: Target | undefined
    let adapterPath: string | undefined
    let output: string | undefined
    let allowLive = false
    for (let index = 0; index < args.length; index++) {
      const argument = args[index]
      if (argument === '--allow-live') { allowLive = true; continue }
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error('Missing argument.')
      if (argument === '--target' && (value === 'contract-stub' || value === 'real-application')) target = value
      else if (argument === '--adapter') adapterPath = value
      else if (argument === '--output') output = value
      else throw new Error('Unknown argument.')
    }
    if (!target) throw new Error('An explicit execution target is required.')
    const artifactRoot = resolve('tests/acceptance/artifacts')
    const outputPath = resolve(output ?? `${artifactRoot}/${target}.json`)
    if (!outputPath.startsWith(`${artifactRoot}${sep}`) || !outputPath.endsWith('.json')) {
      throw new Error('Reports must be JSON inside the owned artifacts directory.')
    }
    let adapter: AcceptanceAdapter | undefined
    let startupFailure: string | undefined
    if (adapterPath) {
      try {
        const module = await import(pathToFileURL(resolve(adapterPath)).href)
        if (typeof module.createAdapter !== 'function') throw new Error('Missing factory.')
        adapter = await module.createAdapter()
        if (!adapter || typeof adapter !== 'object') throw new Error('Missing adapter.')
      } catch {
        startupFailure = 'The explicit adapter failed to load or initialize; no stub fallback was attempted.'
      }
    } else if (target === 'contract-stub') {
      adapter = createContractStubAdapter()
    }
    const report = await runAcceptance({ target, adapter, allowLive, startupFailure })
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify({
      report: relative(process.cwd(), outputPath), target: report.target, outcome: report.outcome,
      counts: report.counts, productAcceptance: report.productAcceptance, evidenceLabel: report.evidenceLabel,
    })}\n`)
    process.exitCode = exitCode(report)
  } catch {
    process.stderr.write('Acceptance runner failed. Use --target contract-stub|real-application [--adapter local-module.mjs] [--allow-live] [--output tests/acceptance/artifacts/name.json]. No successful result is claimed.\n')
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) void main()
