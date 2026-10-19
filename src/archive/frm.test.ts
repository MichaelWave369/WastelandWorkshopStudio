import { describe, expect, it } from 'vitest';
import { parseFrm, parsePal, grayscalePalette, renderFrmPixels, frmDirectionSuffix } from './frm';
import { makeSpriteDemoArchive } from './spriteDemo';
import { extractDatEntry, inspectDat } from './dat';

function minimalFrm(): Uint8Array {
  const bytes = new Uint8Array(62 + 12 + 4);
  const v = new DataView(bytes.buffer);
  v.setUint32(0, 4, false);
  v.setUint16(4, 10, false);
  v.setUint16(8, 1, false);
  v.setUint32(58, 16, false);
  v.setUint16(62, 2, false);
  v.setUint16(64, 2, false);
  v.setUint32(66, 4, false);
  v.setInt16(70, -2, false);
  v.setInt16(72, 3, false);
  bytes.set([0, 1, 2, 3], 74);
  return bytes;
}

describe('Classic FRM + palette formats', () => {
  it('parses a single-direction FRM and big-endian metadata', () => {
    const image = parseFrm(minimalFrm());
    expect(image.version).toBe(4);
    expect(image.fps).toBe(10);
    expect(image.framesPerDirection).toBe(1);
    expect(image.directions).toHaveLength(1);
    const frame = image.directions[0].frames[0];
    expect([frame.width, frame.height, frame.xOffset, frame.yOffset]).toEqual([2, 2, -2, 3]);
    expect(Array.from(frame.pixels)).toEqual([0, 1, 2, 3]);
  });

  it('honors explicit .fr3 single-orientation file suffix', () => {
    const image = parseFrm(minimalFrm(), 'critter.fr3');
    expect(frmDirectionSuffix('creature.FR3')).toBe(3);
    expect(image.directions[0].slot).toBe(3);
  });

  it('maps six-bit palette channels to eight-bit RGBA and makes index zero transparent', () => {
    const bytes = new Uint8Array(768);
    bytes.set([63, 31, 1], 3);
    bytes.set([255, 64, 0], 6);
    const pal = parsePal(bytes);
    const rgba = renderFrmPixels(parseFrm(minimalFrm()).directions[0].frames[0], pal);
    expect(Array.from(rgba.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(rgba.slice(4, 8))).toEqual([255, 125, 4, 255]);
    expect(Array.from(rgba.slice(8, 12))).toEqual([0, 0, 0, 255]);
    expect(grayscalePalette().source).toBe('grayscale');
  });

  it('refuses truncated headers and version mismatches', () => {
    expect(() => parseFrm(new Uint8Array(61))).toThrow(/too small|small/i);
    const bad = minimalFrm();
    new DataView(bad.buffer).setUint32(0, 5, false);
    expect(() => parseFrm(bad)).toThrow(/version/);
  });

  it('refuses mismatched declared frame size', () => {
    const bad = minimalFrm();
    new DataView(bad.buffer).setUint32(66, 1234, false);
    expect(() => parseFrm(bad)).toThrow(/pixel byte count/);
  });

  it('refuses invalid directions and file length', () => {
    const bad = minimalFrm();
    new DataView(bad.buffer).setUint32(38, 900, false);
    expect(() => parseFrm(bad)).toThrow(/direction offset/);
    expect(() => parseFrm(minimalFrm().slice(0, 75))).toThrow(/past EOF|complete resource/);
  });

  it('refuses oversized dimensions, impossible frame counts, and too-short palettes', () => {
    const bad = minimalFrm();
    new DataView(bad.buffer).setUint16(62, 2049, false);
    expect(() => parseFrm(bad)).toThrow(/dimensions/);
    const badCount = minimalFrm();
    new DataView(badCount.buffer).setUint16(8, 101, false);
    expect(() => parseFrm(badCount)).toThrow(/count/);
    expect(() => parsePal(new Uint8Array(767))).toThrow(/768/);
  });

  it('loads two orientations and four animation frames from original demo DAT2', async () => {
    const file = makeSpriteDemoArchive();
    const index = await inspectDat(file);
    expect(index.format).toBe('dat2');
    expect(index.entries).toHaveLength(3);
    const frm = index.entries.find((item) => item.path.endsWith('.frm'));
    const pal = index.entries.find((item) => item.path === 'color.pal');
    expect(frm).toBeDefined();
    expect(pal).toBeDefined();
    const image = parseFrm(await extractDatEntry(file, frm!), frm!.path);
    const palette = parsePal(await extractDatEntry(file, pal!), pal!.path, 'embedded-file');
    expect(image.directions.map((d) => [d.slot, d.frames.length])).toEqual([[0, 4], [1, 4]]);
    expect(image.fps).toBe(7);
    const pixels = renderFrmPixels(image.directions[0].frames[0], palette);
    expect(pixels.length).toBe(19 * 19 * 4);
    expect(pixels.some((value) => value !== 0)).toBe(true);
    expect(new TextDecoder().decode(await extractDatEntry(file, index.entries[2]))).toContain('Original synthetic');
  });

  it('validates frame-data end boundary rather than silently ignoring bytes', () => {
    const bad = new Uint8Array([...minimalFrm(), 99]);
    expect(() => parseFrm(bad)).toThrow(/complete resource/);
  });
});
