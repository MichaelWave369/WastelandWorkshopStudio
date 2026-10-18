import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { classifyPath, extractDatEntry, inspectDat, resourceName } from './dat';

const enc = new TextEncoder();
function put32(v: DataView, at: number, value: number, little: boolean) { v.setUint32(at, value, little); }

function fixtureDat2(items: { path: string; content: Uint8Array; compressed?: boolean }[]): File {
  const payload: number[] = [];
  const table: number[] = [0, 0, 0, 0];
  const count = new DataView(new ArrayBuffer(4)); put32(count, 0, items.length, true);
  table.splice(0, 4, ...new Uint8Array(count.buffer));
  for (const item of items) {
    const filename = enc.encode(item.path);
    const packed = item.compressed ? deflateSync(item.content) : item.content;
    const entry = new Uint8Array(4 + filename.length + 13);
    const v = new DataView(entry.buffer);
    put32(v, 0, filename.length, true);
    entry.set(filename, 4);
    entry[4 + filename.length] = item.compressed ? 1 : 0;
    put32(v, 5 + filename.length, item.content.length, true);
    put32(v, 9 + filename.length, packed.length, true);
    put32(v, 13 + filename.length, payload.length, true);
    table.push(...entry);
    payload.push(...packed);
  }
  const footer = new Uint8Array(8);
  const f = new DataView(footer.buffer);
  put32(f, 0, table.length, true);
  put32(f, 4, payload.length + table.length + 8, true);
  return new File([Uint8Array.from([...payload, ...table, ...footer])], 'master.dat');
}

function fixtureDat1(): File {
  const name = enc.encode('test.msg');
  const metadataLength = 16 + 2 + 16 + 1 + name.length + 16;
  const payload = enc.encode('{100}{}{Hello}');
  const buffer = new Uint8Array(metadataLength + payload.length);
  const v = new DataView(buffer.buffer);
  put32(v, 0, 1, false); put32(v, 4, 1, false);
  buffer[16] = 1; buffer[17] = 46; // DAT1 '.' root
  put32(v, 18, 1, false); put32(v, 22, 1, false); put32(v, 26, 16, false);
  buffer[34] = name.length;
  buffer.set(name, 35);
  const attrs = 35 + name.length;
  put32(v, attrs, 0x20, false);
  put32(v, attrs + 4, metadataLength, false);
  put32(v, attrs + 8, payload.length, false);
  put32(v, attrs + 12, 0, false);
  buffer.set(payload, metadataLength);
  return new File([buffer], 'master.dat');
}

describe('Classic DAT archive index reader', () => {
  it('reads a valid Fallout 2 DAT2 directory and plain payload', async () => {
    const file = fixtureDat2([{ path: 'text\\english\\game\\test.msg', content: enc.encode('{100}{}{Hello}') }]);
    const index = await inspectDat(file);
    expect(index.format).toBe('dat2');
    expect(index.entries[0].path).toBe('text/english/game/test.msg');
    expect(index.entries[0].kind).toBe('Dialogue');
    expect(new TextDecoder().decode(await extractDatEntry(file, index.entries[0]))).toBe('{100}{}{Hello}');
  });
  it('reads and inflates a DAT2 zlib payload', async () => {
    const file = fixtureDat2([{ path: 'test.lst', content: enc.encode('one\none\none\n'), compressed: true }]);
    const index = await inspectDat(file, 'dat2');
    expect(index.entries[0].codec).toBe('zlib');
    expect(new TextDecoder().decode(await extractDatEntry(file, index.entries[0]))).toBe('one\none\none\n');
  });
  it('reads a Fallout 1 DAT1 root directory without losing its dot entry', async () => {
    const file = fixtureDat1();
    const index = await inspectDat(file);
    expect(index.format).toBe('dat1');
    expect(index.entries[0].path).toBe('test.msg');
    expect(new TextDecoder().decode(await extractDatEntry(file, index.entries[0]))).toContain('Hello');
  });
  it('refuses non-DAT data with clear explanation', async () => {
    await expect(inspectDat(new File([enc.encode('hello world')], 'save.dat'))).rejects.toThrow(/DAT1|DAT2/);
  });
  it('refuses directory traversal encoded inside DAT2', async () => {
    await expect(inspectDat(fixtureDat2([{ path: '../escape.txt', content: enc.encode('x') }]), 'dat2')).rejects.toThrow(/traversal/);
  });
  it('rejects an unbounded metadata claim', async () => {
    const bytes = new Uint8Array(16);
    new DataView(bytes.buffer).setUint32(8, 0xffffffff, true);
    await expect(inspectDat(new File([bytes], 'bad.dat'), 'dat2')).rejects.toThrow();
  });
  it('classifies resources and sanitizes download names', () => {
    expect(classifyPath('art/items/thing.frm')).toBe('Art');
    expect(classifyPath('scripts/foo.int')).toBe('Scripts');
    expect(resourceName('art\\critters\\very bad.frm')).toBe('very_bad.frm');
  });
});
