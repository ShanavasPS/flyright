import { maskDay, maskMonth } from './date-input';

describe('maskDay', () => {
  it('inserts the slashes as the digits arrive', () => {
    expect(maskDay('3')).toBe('3');
    expect(maskDay('31')).toBe('31');
    expect(maskDay('310')).toBe('31/0');
    expect(maskDay('3103')).toBe('31/03');
    expect(maskDay('31032')).toBe('31/03/2');
    expect(maskDay('31032027')).toBe('31/03/2027');
  });

  it('keeps a date typed with its own separators', () => {
    expect(maskDay('31/03/2027')).toBe('31/03/2027');
    expect(maskDay('31.03.2027')).toBe('31/03/2027');
    expect(maskDay('31-03-2027')).toBe('31/03/2027');
    expect(maskDay('31 / 03 / 2027')).toBe('31/03/2027');
  });

  it('lets a delete over a slash take the digit before it', () => {
    // The field held "31/03"; backspace removed the slash → "31/0" stays.
    expect(maskDay('31/0')).toBe('31/0');
    // Backspace removed the "0" that followed the slash → "31/" → "31".
    expect(maskDay('31/')).toBe('31');
  });

  it('stops at ten characters and ignores letters', () => {
    expect(maskDay('310320271')).toBe('31/03/2027');
    expect(maskDay('3a1b0c3')).toBe('31/03');
    expect(maskDay('')).toBe('');
  });
});

describe('maskMonth', () => {
  it('shapes a month and a four-digit year', () => {
    expect(maskMonth('0')).toBe('0');
    expect(maskMonth('03')).toBe('03');
    expect(maskMonth('032')).toBe('03/2');
    expect(maskMonth('032027')).toBe('03/2027');
    expect(maskMonth('03/2027')).toBe('03/2027');
    expect(maskMonth('0320271')).toBe('03/2027');
  });
});
