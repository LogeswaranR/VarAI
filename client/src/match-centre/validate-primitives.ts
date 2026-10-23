export type Rec = Record<string, unknown>

export const isRec = (value: unknown): value is Rec => typeof value === 'object' && value !== null && !Array.isArray(value)
export const isStr = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
export const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
export const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)
export const isBool = (value: unknown): value is boolean => typeof value === 'boolean'
export const orNull = <T,>(check: (value: unknown) => value is T) => (value: unknown): value is T | null =>
  value === null || check(value)
export const isStrArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isStr)

export const isNonNegativeInt = (value: unknown): value is number => isInt(value) && value >= 0

/** A string of at most `max` UTF-16 units; empty text is allowed because the server may legitimately send it. */
export const isBounded = (max: number) => (value: unknown): value is string => typeof value === 'string' && value.length <= max

/** A non-blank string of at most `max` UTF-16 units. */
export const isText = (max: number) => (value: unknown): value is string => isStr(value) && value.length <= max

export const isOneOf = <T extends string>(values: readonly T[]) => (value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value)

export const matches = (pattern: RegExp) => (value: unknown): value is string => typeof value === 'string' && pattern.test(value)
