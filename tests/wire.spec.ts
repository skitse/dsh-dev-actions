import { describe, expect, it } from 'vitest'
import { isTrustedRequest } from '../src/trust-fence.js'
import { stringField } from '../src/wire.js'

describe('stringField', () => {
  it('accepts a bounded non-empty string', () => expect(stringField({ value: 'hello' }, 'value')).toBe('hello'))
  it('rejects missing and excessively long fields', () => {
    expect(() => stringField({}, 'value')).toThrow('value must be a non-empty string')
    expect(() => stringField({ value: 'x'.repeat(201) }, 'value')).toThrow('value must be a non-empty string')
  })
})

describe('request trust fence', () => {
  it('accepts loopback and rejects cross-site or forged authorities', () => {
    expect(isTrustedRequest({ headers: { host: '127.0.0.1:3080' } }, [])).toBe(true)
    expect(isTrustedRequest({ headers: { host: '[::1]:3080' } }, [])).toBe(true)
    expect(isTrustedRequest({ headers: { host: '127.0.0.1:3080', origin: 'http://evil.test' } }, [])).toBe(false)
    expect(isTrustedRequest({ headers: { host: 'evil.test', 'sec-fetch-site': 'cross-site' } }, [])).toBe(false)
  })

  it('admits configured DSH trusted authorities only with same-origin requests', () => {
    expect(isTrustedRequest({ headers: { host: 'dev.example.test', origin: 'https://dev.example.test' } }, ['dev.example.test'])).toBe(true)
    expect(isTrustedRequest({ headers: { host: 'dev.example.test', origin: 'https://other.example.test' } }, ['dev.example.test'])).toBe(false)
  })
})
