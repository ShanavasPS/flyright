'use strict';
// Adapted from decode-uri-component 0.5.0 (Sam Verschueren, MIT).
// Process each run in place: no recursion or input-sized replacement map.
const byteAt = (input, position) => input[position] === '%' && /^[a-f\d]{2}$/i.test(input.slice(position + 1, position + 3))
  ? Number.parseInt(input.slice(position + 1, position + 3), 16) : null;

module.exports = function decodeUriComponent(input) {
  if (typeof input !== 'string') throw new TypeError('Expected encodedURI to be a string');
  try { return decodeURIComponent(input); } catch {}
  const output = [];
  for (let position = 0; position < input.length;) {
    const first = byteAt(input, position);
    if (first === null) { output.push(input[position++]); continue; }
    const length = first <= 0x7f ? 1 : first >= 0xc2 && first <= 0xdf ? 2 : first >= 0xe0 && first <= 0xef ? 3 : first >= 0xf0 && first <= 0xf4 ? 4 : 0;
    let valid = length > 0;
    for (let i = 1; valid && i < length; i++) {
      const next = byteAt(input, position + i * 3);
      valid = next !== null && next >= 0x80 && next <= 0xbf;
    }
    if (valid) {
      try {
        output.push(decodeURIComponent(input.slice(position, position + length * 3)));
        position += length * 3;
        continue;
      } catch {}
    }
    // Preserve the legacy decoder's replacement for truncated C2 and BOMs.
    const pair = input.slice(position, position + 6);
    if (pair === '%FE%FF' || pair === '%FF%FE') { output.push('\uFFFD\uFFFD'); position += 6; }
    else { output.push(input.slice(position, position + 3) === '%C2' ? '\uFFFD' : input.slice(position, position + 3)); position += 3; }
  }
  return output.join('');
};
