import { describe, it, expect } from 'vitest'
import { nextDocNumber } from './docNumberService.ts'

const Y = 2026

describe('nextDocNumber', () => {
  it('returns 001 when no existing numbers', () => {
    expect(nextDocNumber('SOB', [], Y)).toBe('SOB-2026-001')
  })

  it('increments past the highest existing number', () => {
    const existing = ['SOB-2026-001', 'SOB-2026-003', 'SOB-2026-002']
    expect(nextDocNumber('SOB', existing, Y)).toBe('SOB-2026-004')
  })

  it('ignores numbers from a different year', () => {
    const existing = ['SOB-2025-010', 'SOB-2025-011']
    expect(nextDocNumber('SOB', existing, Y)).toBe('SOB-2026-001')
  })

  it('ignores numbers from a different type', () => {
    const existing = ['INV-2026-009']
    expect(nextDocNumber('SOB', existing, Y)).toBe('SOB-2026-001')
  })

  it('ignores malformed numbers gracefully', () => {
    const existing = ['SOB-2026-', 'SOB-2026-abc', 'SOB-2026-001']
    expect(nextDocNumber('SOB', existing, Y)).toBe('SOB-2026-002')
  })

  it('pads to 3 digits', () => {
    const existing = Array.from({ length: 9 }, (_, i) => `PAY-2026-00${i + 1}`)
    expect(nextDocNumber('PAY', existing, Y)).toBe('PAY-2026-010')
  })

  it('works for every doc type', () => {
    const types = ['SOB', 'INV', 'OR', 'EXP', 'PAY', 'PO', 'QUO', 'CON'] as const
    for (const t of types) {
      expect(nextDocNumber(t, [], Y)).toBe(`${t}-2026-001`)
    }
  })

  it('does not reuse gaps — picks max+1, not count+1', () => {
    // gap: 002 is missing, but max is 003 → next should be 004
    const existing = ['EXP-2026-001', 'EXP-2026-003']
    expect(nextDocNumber('EXP', existing, Y)).toBe('EXP-2026-004')
  })
})
