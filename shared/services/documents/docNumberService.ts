export type DocType = 'SOB' | 'INV' | 'OR' | 'EXP' | 'PAY' | 'PO' | 'QUO' | 'CON'

const PREFIX: Record<DocType, string> = {
  SOB: 'SOB',
  INV: 'INV',
  OR:  'OR',
  EXP: 'EXP',
  PAY: 'PAY',
  PO:  'PO',
  QUO: 'QUO',
  CON: 'CON',
}

/**
 * Returns the next sequential document number for the given type and year.
 * Pass all existing docs of that type — archived or not — so gaps aren't reused.
 *
 * Format: PREFIX-YYYY-NNN  (e.g. SOB-2026-001)
 */
export function nextDocNumber(
  type: DocType,
  existingNumbers: string[],
  year = new Date().getFullYear()
): string {
  const prefix = `${PREFIX[type]}-${year}-`
  const highest = existingNumbers
    .filter(n => n.startsWith(prefix))
    .map(n => parseInt(n.slice(prefix.length), 10))
    .filter(n => !isNaN(n))
    .reduce((max, n) => (n > max ? n : max), 0)
  return `${prefix}${String(highest + 1).padStart(3, '0')}`
}
