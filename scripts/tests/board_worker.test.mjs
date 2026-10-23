import assert from 'node:assert/strict'
import test from 'node:test'
import { clientOptions, sessionOptions, verifyIdentity } from '../board_worker.mjs'

function options(role = 'development') {
  const payload = {
    role, model: role === 'development' ? 'gpt-6-astra' : 'gpt-6.1-sol',
    workspace: '/fixture/card', configDir: '/fixture/private-config',
    assignment: { checks: ['package', 'owned'] },
  }
  return { payload, config: sessionOptions(payload, { tool: () => 'fixture only', event: () => {} }) }
}

test('client retains normal CLI authentication while worker policy stays private', () => {
  const { payload, config } = options()
  const connection = { kind: 'stdio', path: '/fixture/runtime' }
  const client = clientOptions({ ...payload, root: '/fixture/canonical' }, connection)
  assert.equal(client.connection, connection)
  assert.equal(client.useLoggedInUser, true)
  assert.equal(client.workingDirectory, payload.workspace)
  assert.equal(Object.hasOwn(client, 'baseDirectory'), false)
  assert.equal(Object.hasOwn(client, 'gitHubToken'), false)
  assert.equal(config.configDir, '/fixture/private-config')
  assert.equal(config.enableConfigDiscovery, false)
})

test('model-free preflight does not replace the signed-in CLI profile', () => {
  const client = clientOptions({ root: '/fixture/canonical', configDir: '/fixture/probe' }, { kind: 'stdio' })
  assert.equal(client.workingDirectory, '/fixture/canonical')
  assert.equal(Object.hasOwn(client, 'baseDirectory'), false)
})

test('development has only bounded source/check callbacks', () => {
  const { config } = options()
  assert.deepEqual(config.availableTools, ['varai_list', 'varai_read', 'varai_write', 'varai_remove', 'varai_check'])
  assert.deepEqual(config.tools.map(tool => tool.name), config.availableTools)
  assert.equal(config.workingDirectory, '/fixture/card')
  assert.equal(config.configDir, '/fixture/private-config')
  assert.equal(config.remoteSession, 'off')
  assert.equal(config.enableConfigDiscovery, false)
  assert.deepEqual(config.mcpServers, {})
  assert.deepEqual(config.customAgents, [])
  assert.equal(config.requestExtensions, false)
})

test('QA exposes no write, check, shell or delegation tools', () => {
  const { config } = options('qa')
  assert.deepEqual(config.availableTools, ['varai_list', 'varai_read'])
  assert.deepEqual(config.tools.map(tool => tool.name), config.availableTools)
})

test('unknown built-in tools and runtime permissions are rejected', async () => {
  const { config } = options()
  for (const toolName of ['bash', 'apply_patch', 'task', 'create_session', 'github-mcp-server']) {
    assert.equal((await config.hooks.onPreToolUse({ toolName })).permissionDecision, 'deny')
  }
  assert.equal((await config.onPermissionRequest({ kind: 'write' })).kind, 'reject')
  assert.equal(await config.onAutoModeSwitchRequest({}), 'no')
})

test('schemas do not accept arbitrary check commands or hidden arguments', () => {
  const { config } = options()
  const check = config.tools.find(tool => tool.name === 'varai_check')
  assert.deepEqual(check.parameters.properties.name.enum, ['package', 'owned'])
  for (const tool of config.tools) assert.equal(tool.parameters.additionalProperties, false)
})

test('requested model substitutions are rejected', () => {
  const { payload } = options()
  assert.throws(() => sessionOptions({ ...payload, model: 'auto' }, {}), /Exact role\/model/)
  assert.throws(() => sessionOptions({ ...payload, role: 'unrecognised' }, {}), /Exact role\/model/)
  assert.throws(() => sessionOptions({ ...payload, role: 'unrecognised', model: undefined }, {}), /Exact role\/model/)
})

test('actual model and workspace must be observed and exact', () => {
  const { payload } = options()
  verifyIdentity(payload, 'fixture-session', payload.model, payload.workspace)
  for (const [session, model, workspace] of [
    ['', payload.model, payload.workspace],
    ['fixture-session', 'auto', payload.workspace],
    ['fixture-session', payload.model, '/fixture/canonical'],
    ['fixture-session', payload.model, undefined],
  ]) {
    assert.throws(() => verifyIdentity(payload, session, model, workspace), /Actual runtime identity/)
  }
})
