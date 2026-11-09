import { describe, expect, it } from 'vitest'
import {
  DUAL_MAX_MULTIPLIER_X100,
  DUAL_MIN_MULTIPLIER_X100,
} from './config'
import {
  computeCrash,
  generateClientSeed,
  generateServerSeed,
  hashServerSeed,
} from './fair'

describe('provably fair crash', () => {
  const serverSeed =
    '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
  const clientSeeds = ['alice-seed', 'bob-seed']

  it('produces a fixed known vector', () => {
    const result = computeCrash(serverSeed, clientSeeds, 0)
    expect(result.hmacHex).toBe(
      'e5184f39d0b4ab4e888f036c480cffff0ae9a00c1a58fbd1f0370bfdaa5d0c92',
    )
    expect(result.uniform).toBe(3_843_575_609)
    expect(result.crashMultiplierX100).toBe(951)
  })

  it('is independent of client seed ordering', () => {
    const a = computeCrash(serverSeed, ['b-seed', 'a-seed'], 7)
    const b = computeCrash(serverSeed, ['a-seed', 'b-seed'], 7)
    expect(a).toEqual(b)
  })

  it('changes with the nonce', () => {
    const first = computeCrash(serverSeed, clientSeeds, 0)
    const second = computeCrash(serverSeed, clientSeeds, 1)
    expect(first.crashMultiplierX100).not.toBe(second.crashMultiplierX100)
  })

  it('stays inside the configured bounds', () => {
    const generated = generateServerSeed()
    for (let nonce = 0; nonce < 250; nonce++) {
      const result = computeCrash(generated, clientSeeds, nonce)
      expect(Number.isInteger(result.crashMultiplierX100)).toBe(true)
      expect(result.crashMultiplierX100).toBeGreaterThanOrEqual(DUAL_MIN_MULTIPLIER_X100)
      expect(result.crashMultiplierX100).toBeLessThanOrEqual(DUAL_MAX_MULTIPLIER_X100)
    }
  })

  it('hashes the server seed deterministically', () => {
    const hash = hashServerSeed(serverSeed)
    expect(hash).toBe(hashServerSeed(serverSeed))
    expect(hash).toHaveLength(64)
  })

  it('generates distinct seeds', () => {
    expect(generateServerSeed()).not.toBe(generateServerSeed())
    expect(generateClientSeed()).toHaveLength(32)
  })
})
