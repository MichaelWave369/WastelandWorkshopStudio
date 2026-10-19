/**
 * Fallout 1 DAT1 block-LZSS decoder.
 *
 * Independently implemented from published format descriptions.
 * Blocks are signed big-endian int16: negative=raw copy, positive=LZSS tokens,
 * zero=end. Positive blocks reset a 4096-byte dictionary filled with spaces.
 *
 * Operates only on a bounded resource byte slice. Does not touch filesystem.
 * Reference: https://github.com/rotators/fallout2-docs/blob/master/content/pages/dat.md
 */
export const DAT1_MAX_DECODED_BYTES = 24 * 1024 * 1024;
const DICT_SIZE = 4096;
const DICT_MASK = DICT_SIZE - 1;
const INITIAL_WRITE_INDEX = DICT_SIZE - 18;

function ensure(ok: boolean, reason: string): asserts ok {
  if (!ok) throw new Error('DAT1 LZSS: ' + reason);
}

export function decodeDat1Lzss(packed: Uint8Array, expectedSize: number): Uint8Array {
  ensure(Number.isSafeInteger(expectedSize) && expectedSize >= 0
    && expectedSize <= DAT1_MAX_DECODED_BYTES, 'uncompressed size is invalid or exceeds the 24 MiB limit.');
  ensure(packed.byteLength <= DAT1_MAX_DECODED_BYTES,
    'compressed entry exceeds the 24 MiB limit.');

  const result = new Uint8Array(expectedSize);
  const dictionary = new Uint8Array(DICT_SIZE);
  let position = 0;
  let output = 0;
  let sawEnd = false;

  function emit(value: number): void {
    ensure(output < expectedSize, 'decoded data exceeds the declared uncompressed size.');
    result[output++] = value;
  }

  while (position < packed.byteLength) {
    ensure(position + 2 <= packed.byteLength, 'truncated signed block header.');
    const rawHeader = (packed[position] << 8) | packed[position + 1];
    const length = rawHeader & 0x8000 ? rawHeader - 0x10000 : rawHeader;
    position += 2;

    if (length === 0) {
      sawEnd = true;
      ensure(position === packed.byteLength, 'trailing bytes follow the end marker.');
      break;
    }

    ensure(length !== -32768, 'unsupported minimum-int16 block length.');
    const blockBytes = Math.abs(length);
    ensure(position + blockBytes <= packed.byteLength, 'truncated block payload.');
    const end = position + blockBytes;

    if (length < 0) {
      ensure(output + blockBytes <= expectedSize, 'raw block would exceed declared output size.');
      result.set(packed.subarray(position, end), output);
      output += blockBytes;
      position = end;
      // Raw blocks don't participate in the sliding dictionary.
      continue;
    }

    dictionary.fill(0x20);
    let writePosition = INITIAL_WRITE_INDEX;
    while (position < end) {
      const flags = packed[position++];
      ensure(position < end, 'compressed block ends with a flag byte but no token.');
      for (let bit = 0; bit < 8 && position < end; bit += 1) {
        if (flags & (1 << bit)) {
          const value = packed[position++];
          emit(value);
          dictionary[writePosition] = value;
          writePosition = (writePosition + 1) & DICT_MASK;
        } else {
          ensure(position + 2 <= end, 'truncated LZSS back-reference.');
          const low = packed[position++];
          const highAndLength = packed[position++];
          let readPosition = low | ((highAndLength & 0xf0) << 4);
          const matchLength = (highAndLength & 0x0f) + 3;
          ensure(output + matchLength <= expectedSize, 'back-reference exceeds declared output size.');
          for (let j = 0; j < matchLength; j += 1) {
            const value = dictionary[readPosition];
            emit(value);
            dictionary[writePosition] = value;
            readPosition = (readPosition + 1) & DICT_MASK;
            writePosition = (writePosition + 1) & DICT_MASK;
          }
        }
      }
    }
    ensure(position === end, 'compressed block payload was not consumed exactly.');
  }
  ensure(sawEnd || position === packed.length, 'packed block stream ended unexpectedly.');
  ensure(output === expectedSize, 'decompressed length mismatch; expected ' + expectedSize + ', got ' + output + '.');
  return result;
}
