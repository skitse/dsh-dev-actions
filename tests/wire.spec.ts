import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { isTrustedRequest } from '../src/trust-fence.js'
import { DEV_ACTIONS_SKILL_CONTENT, DEV_ACTIONS_SKILL_NAME } from '../src/skill.js'
import { booleanField, optionalStringField, stringField } from '../src/wire.js'

describe('runtime skill', () => {
  it('ships the maintenance workflow as embedded content', () => {
    expect(DEV_ACTIONS_SKILL_NAME).toBe('dev-actions-maintainer')
    expect(DEV_ACTIONS_SKILL_CONTENT).toContain('dev_action_upsert')
  })
})

describe('package client discovery', () => {
  it('exports package.json for the DSH client-module scanner', () => {
    const require = createRequire(import.meta.url)
    expect(require.resolve('dsh-dev-actions/package.json')).toMatch(/package\.json$/)
  })
})

describe('stringField', () => {
  it('accepts a bounded non-empty string', () => expect(stringField({ value: 'hello' }, 'value')).toBe('hello'))
  it('rejects missing and excessively long fields', () => {
    expect(() => stringField({}, 'value')).toThrow('value must be a non-empty string')
    expect(() => stringField({ value: 'x'.repeat(201) }, 'value')).toThrow('value must be a non-empty string')
  })
})

describe('optional fields', () => {
  it('keeps absence distinct from invalid values', () => {
    expect(optionalStringField({}, 'status')).toBeUndefined()
    expect(booleanField({}, 'pinned', true)).toBeUndefined()
    expect(booleanField({ pinned: false }, 'pinned', true)).toBe(false)
    expect(() => booleanField({ pinned: 'yes' }, 'pinned', true)).toThrow('pinned must be a boolean')
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
