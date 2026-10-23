import { readFile } from 'node:fs/promises'
import { validateBrowserReport } from './artifacts/runner/cli.mjs'

const report = JSON.parse(await readFile('tests/acceptance/artifacts/browser-report.json', 'utf8'))
console.log(JSON.stringify(validateBrowserReport(report)))
