import { readFile, writeFile } from 'node:fs/promises'
import { codegen } from '@graphql-codegen/core'
import * as operations from '@graphql-codegen/typescript-operations'
import {
  buildSchema, isAbstractType, isEnumType, isListType, isNonNullType,
  isObjectType, isScalarType, Kind, parse, validate,
} from 'graphql'

const check = process.argv.slice(2).join(' ') === '--check'
if (process.argv.length > 2 && !check) throw new Error('Usage: node scripts/generate-graphql.mjs [--check]')

const schemaText = await readFile('contracts/schema.graphql', 'utf8')
const document = parse(await readFile('contracts/operations.graphql', 'utf8'))
const schema = buildSchema(schemaText)
const errors = validate(schema, document)
if (errors.length) throw new AggregateError(errors, 'Contract operations do not match the schema.')
const filename = 'client/src/contracts/graphql.generated.ts'
const output = await codegen({
  filename,
  schema: parse(schemaText),
  documents: [{ location: 'contracts/operations.graphql', document }],
  config: {
    immutableTypes: true,
    enumsAsTypes: true,
    avoidOptionals: true,
    skipTypename: true,
    useTypeImports: true,
    strictScalars: true,
    arrayInputCoercion: false,
  },
  plugins: [{ typescriptOperations: {} }],
  pluginMap: { typescriptOperations: operations },
})
await save(filename, '// Generated from the C# schema and approved operations; do not edit.\n' + output)

const fragments = new Map(document.definitions
  .filter(definition => definition.kind === Kind.FRAGMENT_DEFINITION)
  .map(fragment => [fragment.name.value, fragment]))
const operationDefinitions = document.definitions.filter(definition => definition.kind === Kind.OPERATION_DEFINITION)
let guards = "// Generated from the selected GraphQL operation fields; do not edit.\n"
guards += "import { matchesShape, type Shape } from './response-shape'\n"
for (const operation of operationDefinitions) {
  if (!operation.name) throw new Error('Contract operations must be named.')
  const name = operation.name.value
  const typeName = `${name}${operation.operation === 'query' ? 'Query' : 'Mutation'}`
  const root = operation.operation === 'query' ? schema.getQueryType() : schema.getMutationType()
  if (!root) throw new Error(`Missing root for ${name}`)
  const shape = objectShape(root, operation.selectionSet)
  guards += `import type { ${typeName} } from './graphql.generated'\n`
  guards += `const ${name}Shape = ${JSON.stringify(shape, null, 2)} as const satisfies Shape\n`
  guards += `export function is${typeName}(value: unknown): value is ${typeName} {\n  return matchesShape(value, ${name}Shape)\n}\n`
}
await save('client/src/contracts/response-shapes.generated.ts', guards)
console.log(`GraphQL TypeScript ${check ? 'drift check' : 'generation'} passed for ${operationDefinitions.length} operations.`)

function shapeFor(type, selectionSet) {
  return isNonNullType(type)
    ? nonNullShape(type.ofType, selectionSet)
    : { kind: 'nullable', value: nonNullShape(type, selectionSet) }
}

function nonNullShape(type, selectionSet) {
  if (isListType(type)) return { kind: 'list', item: shapeFor(type.ofType, selectionSet) }
  if (isScalarType(type)) {
    if (!['String', 'Boolean', 'Int', 'Float', 'ID'].includes(type.name)) throw new Error(`Unmapped scalar ${type.name}`)
    return { kind: 'scalar', name: type.name }
  }
  if (isEnumType(type)) return { kind: 'enum', values: type.getValues().map(value => value.name) }
  if (!selectionSet) throw new Error(`Missing selection for ${type.name}`)
  if (isAbstractType(type)) {
    const members = Object.fromEntries(schema.getPossibleTypes(type).map(member => [member.name, objectShape(member, selectionSet)]))
    for (const shape of Object.values(members)) {
      if (!shape.fields.__typename) throw new Error(`Select __typename for ${type.name}.`)
    }
    return { kind: 'union', members }
  }
  if (isObjectType(type)) return objectShape(type, selectionSet)
  throw new Error(`Unsupported output type ${type}`)
}

function objectShape(type, selectionSet) {
  const fields = {}
  for (const selection of selectionSet.selections) {
    if (selection.directives?.length) throw new Error('Baseline operations must select their full contract without conditional directives.')
    if (selection.kind === Kind.FIELD) {
      const name = selection.name.value
      const field = type.getFields()[name]
      if (name !== '__typename' && !field) throw new Error(`Unknown selected field ${type.name}.${name}`)
      fields[selection.alias?.value ?? name] = name === '__typename'
        ? { kind: 'enum', values: [type.name] }
        : shapeFor(field.type, selection.selectionSet)
    } else {
      const fragment = selection.kind === Kind.FRAGMENT_SPREAD ? fragments.get(selection.name.value) : selection
      if (!fragment) throw new Error('Missing fragment.')
      const condition = fragment.typeCondition ? schema.getType(fragment.typeCondition.name.value) : type
      if (condition === type || (isAbstractType(condition) && schema.isSubType(condition, type))) {
        Object.assign(fields, objectShape(type, fragment.selectionSet).fields)
      }
    }
  }
  return { kind: 'object', fields }
}

async function save(path, content) {
  const normalized = content.replaceAll('\r\n', '\n').trimEnd() + '\n'
  if (check) {
    if (await readFile(path, 'utf8') !== normalized) throw new Error(`${path} is stale. Run npm run contracts:generate.`)
  } else {
    await writeFile(path, normalized)
  }
}
