import { decodeDat1Lzss } from './lzss';

/**
 * Original, read-only index readers for classic Fallout DAT archive containers.
 * Reference: https://github.com/rotators/fallout2-docs/blob/master/content/pages/dat.md
 */
export type DatFormat = 'dat1' | 'dat2';
export type FormatPreference = 'auto' | DatFormat;
export type ResourceKind = 'Art' | 'Maps' | 'Dialogue' | 'Scripts' | 'Prototypes' | 'Audio' | 'Text' | 'Other';

export interface DatEntry {
  path: string;
  kind: ResourceKind;
  offset: number;
  storedSize: number;
  originalSize: number;
  compressed: boolean;
  codec: 'none' | 'zlib' | 'lzss';
}
export interface DatIndex {
  format: DatFormat;
  byteLength: number;
  entries: DatEntry[];
  warnings: string[];
}
export const MAX_ARCHIVE_BYTES = 2_147_483_648;
export const MAX_INDEX_BYTES = 32 * 1024 * 1024;
export const MAX_EXTRACT_BYTES = 24 * 1024 * 1024;
export const MAX_ENTRIES = 150_000;
const decoder = new TextDecoder('windows-1252');

function check(condition: boolean, explanation: string): asserts condition {
  if (!condition) throw new Error(explanation);
}
function getU32(view: DataView, at: number, little: boolean): number {
  check(at >= 0 && at + 4 <= view.byteLength, 'Archive metadata ends unexpectedly.');
  return view.getUint32(at, little);
}
function getPath(bytes: Uint8Array, start: number, length: number): string {
  check(length >= 1 && length <= 1024 && start >= 0 && start + length <= bytes.length,
    'Invalid or truncated archive path.');
  const name = decoder.decode(bytes.subarray(start, start + length)).replace(/\\/g, '/');
  check(!name.startsWith('/') && !/^[a-z]:/i.test(name) && !/[\u0000-\u001f\u007f]/.test(name),
    'Archive contains a dangerous or malformed entry path.');
  const segments = name.split('/');
  check(segments.every((segment) => segment !== '' && segment !== '..' && segment !== '.'),
    'Archive path traversal or empty directory component detected.');
  return name;
}
export function classifyPath(path: string): ResourceKind {
  const p = path.toLowerCase();
  if (/\.(frm|fr[0-9]|rix|pal|fon|aaf|bmp|png|gif)$/.test(p)) return 'Art';
  if (/\.(map|gam)$/.test(p)) return 'Maps';
  if (/\.msg$/.test(p)) return 'Dialogue';
  if (/\.(int|ssl)$/.test(p)) return 'Scripts';
  if (/\.(pro|gcd)$/.test(p)) return 'Prototypes';
  if (/\.(acm|wav|ogg|mp3|mve)$/.test(p)) return 'Audio';
  if (/\.(txt|lst|ini|cfg|log)$/.test(p)) return 'Text';
  return 'Other';
}
function checkStoredRange(offset: number, stored: number, dataStart: number, dataEnd: number): void {
  check(Number.isSafeInteger(offset) && Number.isSafeInteger(stored)
    && offset >= dataStart && offset <= dataEnd
    && stored >= 0 && stored <= dataEnd - offset,
    'An entry refers outside the archive data region.');
}
function duplicates(entries: DatEntry[]): string[] {
  const seen = new Set<string>();
  let count = 0;
  for (const entry of entries) {
    const key = entry.path.toLowerCase();
    if (seen.has(key)) count += 1;
    seen.add(key);
  }
  return count ? [count + ' duplicate case-insensitive path(s). Entries are shown separately; verify before extraction.'] : [];
}
async function parseDat2(file: File): Promise<DatIndex> {
  check(file.size >= 12, 'Too small to be a DAT2 archive.');
  const footer = new DataView(await file.slice(file.size - 8).arrayBuffer());
  const treeSize = getU32(footer, 0, true);
  const dataSize = getU32(footer, 4, true);
  check(treeSize >= 4 && treeSize <= MAX_INDEX_BYTES && dataSize <= file.size && dataSize >= treeSize + 8,
    'DAT2 footer or index size is invalid.');
  const treeStart = file.size - 8 - treeSize;
  const dataBase = file.size - dataSize;
  check(treeStart >= dataBase, 'DAT2 directory overlaps the data base.');
  const buffer = new Uint8Array(await file.slice(treeStart, file.size - 8).arrayBuffer());
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const count = getU32(view, 0, true);
  check(count <= MAX_ENTRIES && count <= (treeSize - 4) / 17, 'DAT2 entry count exceeds the index bounds.');
  const entries: DatEntry[] = [];
  let cursor = 4;
  for (let index = 0; index < count; index += 1) {
    const length = getU32(view, cursor, true);
    cursor += 4;
    check(length > 0 && length <= 1024 && cursor + length + 13 <= buffer.length, 'DAT2 path length is invalid.');
    const path = getPath(buffer, cursor, length);
    cursor += length;
    const flag = buffer[cursor++];
    check(flag === 0 || flag === 1, 'DAT2 contains an unknown compression flag.');
    const originalSize = getU32(view, cursor, true);
    const storedSize = getU32(view, cursor + 4, true);
    const relativeOffset = getU32(view, cursor + 8, true);
    cursor += 12;
    const offset = dataBase + relativeOffset;
    checkStoredRange(offset, storedSize, dataBase, treeStart);
    check(flag === 1 || originalSize === storedSize, 'DAT2 plain entry has mismatched stored and original sizes.');
    entries.push({
      path, kind: classifyPath(path), offset, storedSize, originalSize,
      compressed: flag === 1, codec: flag === 1 ? 'zlib' : 'none',
    });
  }
  check(cursor === buffer.byteLength, 'DAT2 has unexpected trailing bytes in the directory index.');
  return { format: 'dat2', byteLength: file.size, entries, warnings: duplicates(entries) };
}
async function parseDat1(file: File): Promise<DatIndex> {
  check(file.size >= 17, 'Too small to be a DAT1 archive.');
  const headerBytes = new Uint8Array(await file.slice(0, Math.min(file.size, MAX_INDEX_BYTES)).arrayBuffer());
  const view = new DataView(headerBytes.buffer, headerBytes.byteOffset, headerBytes.byteLength);
  const count = getU32(view, 0, false);
  const allocationHint = getU32(view, 4, false);
  check(count >= 1 && count <= 8192 && allocationHint >= count,
    'DAT1 directory count or allocation hint is invalid.');
  const directories: string[] = [];
  let cursor = 16;
  for (let index = 0; index < count; index += 1) {
    check(cursor < headerBytes.length, 'DAT1 directory-name block is truncated.');
    const length = headerBytes[cursor++];
    check(length > 0 && length <= 255 && cursor + length <= headerBytes.length, 'DAT1 directory name is malformed.');
    const raw = decoder.decode(headerBytes.subarray(cursor, cursor + length));
    const dir = raw === '.' ? '' : getPath(headerBytes, cursor, length);
    directories.push(dir);
    cursor += length;
  }
  const entries: DatEntry[] = [];
  for (const dir of directories) {
    check(cursor + 16 <= headerBytes.length, 'DAT1 directory content header is truncated.');
    const fileCount = getU32(view, cursor, false);
    const hint = getU32(view, cursor + 4, false);
    const fieldsSize = getU32(view, cursor + 8, false);
    cursor += 16;
    check(fileCount <= MAX_ENTRIES - entries.length && hint >= fileCount && fieldsSize === 16,
      'DAT1 file-count, allocation hint, or entry metadata width is invalid.');
    for (let index = 0; index < fileCount; index += 1) {
      check(cursor < headerBytes.length, 'DAT1 file record is truncated.');
      const length = headerBytes[cursor++];
      check(length > 0 && cursor + length + 16 <= headerBytes.length, 'DAT1 file name record is invalid.');
      const name = getPath(headerBytes, cursor, length);
      cursor += length;
      const attributes = getU32(view, cursor, false);
      const offset = getU32(view, cursor + 4, false);
      const originalSize = getU32(view, cursor + 8, false);
      const packedSize = getU32(view, cursor + 12, false);
      cursor += 16;
      check(attributes === 0x20 || attributes === 0x40, 'DAT1 entry has an unsupported compression attribute.');
      const compressed = attributes === 0x40;
      const storedSize = compressed ? packedSize : originalSize;
      const path = dir ? dir + '/' + name : name;
      entries.push({ path, kind: classifyPath(path), offset, storedSize, originalSize,
        compressed, codec: compressed ? 'lzss' : 'none' });
    }
  }
  for (const entry of entries) checkStoredRange(entry.offset, entry.storedSize, cursor, file.size);
  return { format: 'dat1', byteLength: file.size, entries, warnings: duplicates(entries) };
}
export async function inspectDat(file: File, preference: FormatPreference = 'auto'): Promise<DatIndex> {
  check(file.size > 0 && file.size <= MAX_ARCHIVE_BYTES, 'Archive is empty or exceeds the 2 GiB browser safety limit.');
  if (preference === 'dat1') return parseDat1(file);
  if (preference === 'dat2') return parseDat2(file);
  try { return await parseDat2(file); } catch (dat2Error) {
    try { return await parseDat1(file); } catch (dat1Error) {
      const reason2 = dat2Error instanceof Error ? dat2Error.message : 'Unknown DAT2 error';
      const reason1 = dat1Error instanceof Error ? dat1Error.message : 'Unknown DAT1 error';
      throw new Error('Not a valid supported DAT1 or DAT2 archive. DAT2: ' + reason2 + ' DAT1: ' + reason1);
    }
  }
}
export async function extractDatEntry(file: File, entry: DatEntry): Promise<Uint8Array> {
  check(entry.originalSize <= MAX_EXTRACT_BYTES && entry.storedSize <= MAX_EXTRACT_BYTES,
    'Entry is larger than the 24 MiB per-resource safety limit.');
  checkStoredRange(entry.offset, entry.storedSize, 0, file.size);
  const bytes = new Uint8Array(await file.slice(entry.offset, entry.offset + entry.storedSize).arrayBuffer());
  check(bytes.byteLength === entry.storedSize, 'Entry byte range could not be read completely.');
  if (entry.codec === 'none') {
    check(bytes.length === entry.originalSize, 'Plain entry size mismatch.');
    return bytes;
  }
  if (entry.codec === 'lzss') return decodeDat1Lzss(bytes, entry.originalSize);
  check(entry.codec === 'zlib', 'Unknown codec.');
  check(typeof DecompressionStream !== 'undefined', 'This browser does not support zlib decompression via DecompressionStream.');
  let stream: ReadableStream<Uint8Array>;
  try {
    stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  } catch {
    throw new Error('Unable to initialize zlib decompression in this browser.');
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let outputLength = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      outputLength += item.value.byteLength;
      check(outputLength <= MAX_EXTRACT_BYTES && outputLength <= entry.originalSize,
        'Decompressed entry exceeds its declared size or the extraction limit.');
      chunks.push(item.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error instanceof Error ? error : new Error('Malformed zlib entry.');
  } finally {
    reader.releaseLock();
  }
  check(outputLength === entry.originalSize, 'Decompressed entry length does not match its metadata.');
  const result = new Uint8Array(outputLength);
  let offset = 0;
  chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.byteLength; });
  return result;
}
export function isTextResource(path: string): boolean {
  return /\.(msg|txt|lst|ini|cfg|ssl|log)$/i.test(path);
}
export function hexPreview(data: Uint8Array, limit = 128): string {
  return Array.from(data.subarray(0, limit), (value) => value.toString(16).padStart(2, '0')).join(' ').replace(/((?:[0-9a-f]{2} ){15}[0-9a-f]{2}) /g, '$1\n');
}
export function resourceName(path: string): string {
  const last = path.split(/[\\/]/).pop() ?? 'resource.bin';
  return last.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'resource.bin';
}
