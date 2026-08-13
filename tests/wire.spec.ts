import { describe, expect, it } from 'vitest'
import { stringField } from '../src/wire.js'

describe('stringField', () => {
  it('accepts a bounded non-empty string', () => expect(stringField({ value: 'hello' }, 'value')).toBe('hello'))
  it('rejects missing and excessively long fields', () => {
    expect(() => stringField({}, 'value')).toThrow('value must be a non-empty string')
    expect(() => stringField({ value: 'x'.repeat(201) }, 'value')).toThrow('value must be a non-empty string')
  })
})
