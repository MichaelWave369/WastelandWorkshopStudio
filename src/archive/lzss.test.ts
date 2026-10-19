import { describe, expect, it } from 'vitest';
import { decodeDat1Lzss } from './lzss';

const encode = (arr: number[]) => Uint8Array.from(arr);
const text = (buf: Uint8Array) => new TextDecoder().decode(buf);

describe('DAT1 block LZSS (original synthetic fixtures)', () => {
  it('decodes a negative signed literal block and terminator', () => {
    expect(text(decodeDat1Lzss(encode([0xff, 0xfd, 67, 65, 84, 0, 0]), 3))).toBe('CAT');
  });

  it('decodes a positive block with literal flags in LSB order', () => {
    // positive block length = 4, flags 0b00000111, C A T
    expect(text(decodeDat1Lzss(encode([0, 4, 7, 67, 65, 84, 0, 0]), 3))).toBe('CAT');
  });

  it('handles overlapping backreferences as bytes are written to dictionary', () => {
    // Flag 1 = literal A followed by offset 0xFEE and match length 6.
    expect(text(decodeDat1Lzss(encode([0, 4, 1, 65, 0xee, 0xf3, 0, 0]), 7))).toBe('AAAAAAA');
  });

  it('initializes dictionary with spaces', () => {
    // A match at ring offset zero before any written output copies space bytes.
    expect(text(decodeDat1Lzss(encode([0, 3, 0, 0, 0, 0, 0]), 3))).toBe('   ');
  });

  it('combines multiple negative and positive blocks without feeding raw block into dictionary', () => {
    expect(text(decodeDat1Lzss(encode([
      0xff, 0xfd, 97, 98, 99, // raw abc
      0, 2, 1, 90,            // positive literal Z
      0xff, 0xfe, 88, 89,     // raw XY
      0, 0,
    ]), 6))).toBe('abcZXY');
  });

  it('resets dictionary between positive blocks', () => {
    // First block writes A to 0xFEE. Second block reads 0xFEE after reset, yielding space.
    expect(text(decodeDat1Lzss(encode([
      0, 2, 1, 65,
      0, 3, 0, 0xee, 0xf0,
      0, 0,
    ]), 4))).toBe('A   ');
  });

  it('accepts packed streams ending exactly at block boundary without explicit terminator', () => {
    expect(text(decodeDat1Lzss(encode([0xff, 0xfe, 79, 75]), 2))).toBe('OK');
  });

  it.each([
    { name: 'truncated header', source: [0], output: 0 },
    { name: 'truncated raw block', source: [0xff, 0xfc, 65, 66], output: 4 },
    { name: 'truncated LZSS pair', source: [0, 2, 0, 0xee], output: 3 },
    { name: 'no token after flags', source: [0, 1, 1], output: 1 },
    { name: 'overlong raw block', source: [0xff, 0xfd, 65, 66, 67], output: 2 },
    { name: 'overlong backreference', source: [0, 3, 0, 0, 0], output: 2 },
    { name: 'trailing bytes after terminator', source: [0, 0, 65], output: 0 },
    { name: 'wrong declared output length', source: [0xff, 0xff, 65, 0, 0], output: 2 },
    { name: 'negative block size -32768', source: [0x80, 0, 0, 0], output: 0 },
  ])('fails closed on $name', ({ source, output }) => {
    expect(() => decodeDat1Lzss(encode(source), output)).toThrow(/DAT1 LZSS/);
  });

  it('enforces a 24 MiB output cap before allocation', () => {
    expect(() => decodeDat1Lzss(encode([]), 24 * 1024 * 1024 + 1)).toThrow(/limit/);
  });
});
