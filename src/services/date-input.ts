/**
 * Dates typed into a form, shaped as they are typed. The traveller types
 * digits and the slashes appear by themselves — "31032027" reads
 * "31/03/2027" by the time the last digit lands — so the save-time check
 * (parseDay / parseMonth in screens/membership-edit) is for a date that
 * does not exist, not for a missing separator. Separators the traveller
 * types anyway are accepted and normalised to slashes; deleting back over a
 * slash removes the digit before it too, so the field never sticks.
 */

function shape(text: string, groups: number[]): string {
  const digits = text.replace(/\D/g, '').slice(0, groups.reduce((sum, n) => sum + n, 0));
  const parts: string[] = [];
  let at = 0;
  for (const size of groups) {
    if (at >= digits.length) break;
    parts.push(digits.slice(at, at + size));
    at += size;
  }
  return parts.join('/');
}

/** Day, month and four-digit year: "DD/MM/YYYY". */
export function maskDay(text: string): string {
  return shape(text, [2, 2, 4]);
}

/** Month and four-digit year: "MM/YYYY". */
export function maskMonth(text: string): string {
  return shape(text, [2, 4]);
}
