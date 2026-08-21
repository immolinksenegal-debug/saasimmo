/**
 * Normalizes a loosely-typed Senegalese phone number into E.164
 * (+221XXXXXXXXX) — the format the backend's `zPhone` validator requires.
 * Users naturally type "77 117 79 77" or "0771177977"; without this, those
 * get rejected as VALIDATION_FAILED even though they're valid numbers.
 */
export function normalizeSenegalPhone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('221')) return `+${digits}`;
  if (digits.startsWith('0')) return `+221${digits.slice(1)}`;
  return `+221${digits}`;
}
