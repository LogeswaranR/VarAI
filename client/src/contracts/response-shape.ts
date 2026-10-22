export type Shape =
  | { readonly kind: 'nullable'; readonly value: Shape }
  | { readonly kind: 'list'; readonly item: Shape }
  | { readonly kind: 'scalar'; readonly name: 'String' | 'ID' | 'Boolean' | 'Int' | 'Float' }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'object'; readonly fields: Readonly<Record<string, Shape>> }
  | { readonly kind: 'union'; readonly members: Readonly<Record<string, Shape>> }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function matchesShape(value: unknown, shape: Shape): boolean {
  switch (shape.kind) {
    case 'nullable':
      return value === null || matchesShape(value, shape.value)
    case 'list':
      return Array.isArray(value) && value.every(item => matchesShape(item, shape.item))
    case 'enum':
      return typeof value === 'string' && shape.values.includes(value)
    case 'scalar':
      switch (shape.name) {
        case 'String':
        case 'ID':
          return typeof value === 'string'
        case 'Boolean':
          return typeof value === 'boolean'
        case 'Int':
          return typeof value === 'number' && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
        case 'Float':
          return typeof value === 'number' && Number.isFinite(value)
      }
      break
    case 'object':
      return isRecord(value) &&
        Object.keys(value).length === Object.keys(shape.fields).length &&
        Object.entries(shape.fields).every(([key, child]) =>
          Object.hasOwn(value, key) && matchesShape(value[key], child))
    case 'union':
      return isRecord(value) && typeof value.__typename === 'string' &&
        Object.hasOwn(shape.members, value.__typename) &&
        matchesShape(value, shape.members[value.__typename])
  }
  return false
}
