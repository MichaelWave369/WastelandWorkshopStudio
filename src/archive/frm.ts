/**
 * Original read-only Fallout 1/2 FRM parser and 6-bit palette renderer.
 *
 * Format references: TeamX FRM layout, https://sucs.org/~grepwood/teamx/frm_2.html
 * and Fallout .PAL field description at https://fodev.net/files/fo2/pal.html
 * Neither third-party implementation nor copyrighted assets are used.
 */
export const MAX_FRM_BYTES = 24 * 1024 * 1024;
export const MAX_FRM_PIXELS = 4_194_304;
const FRM_HEADER = 62;
const FRAME_HEADER = 12;

export type FrmFrame = {
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
  pixels: Uint8Array;
};
export type FrmDirection = {
  slot: number;
  xShift: number;
  yShift: number;
  frames: FrmFrame[];
};
export type FrmImage = {
  version: number;
  fps: number;
  actionFrame: number;
  framesPerDirection: number;
  directions: FrmDirection[];
};
export type RgbPalette = {
  rgba: Uint8Array;
  label: string;
  source: 'embedded-file' | 'selected-file' | 'grayscale';
};

function assert(ok: boolean, msg: string): asserts ok {
  if (!ok) throw new Error('FRM: ' + msg);
}

/**
 * A .fr0–.fr5 suffix denotes a single direction stored as a separate file.
 * .frm files can have one direction or up to six.
 */
export function frmDirectionSuffix(name: string): number | null {
  const found = /\.fr([0-5])$/i.exec(name);
  return found ? Number(found[1]) : null;
}

export function parseFrm(data: Uint8Array, fileName = 'resource.frm'): FrmImage {
  assert(data.byteLength >= FRM_HEADER && data.byteLength <= MAX_FRM_BYTES,
    'file too small or exceeds the 24 MiB input limit.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = view.getUint32(0, false);
  assert(version === 4, 'unsupported version ' + version + ' (expected 4).');
  const fps = view.getUint16(4, false);
  const actionFrame = view.getUint16(6, false);
  const framesPerDirection = view.getUint16(8, false);
  assert(framesPerDirection >= 1 && framesPerDirection <= 100,
    'invalid frames-per-direction count (1–100 supported).');
  const xShifts = Array.from({ length: 6 }, (_, i) => view.getInt16(10 + i * 2, false));
  const yShifts = Array.from({ length: 6 }, (_, i) => view.getInt16(22 + i * 2, false));
  const offsets = Array.from({ length: 6 }, (_, i) => view.getUint32(34 + i * 4, false));
  const frameAreaSize = view.getUint32(58, false);

  assert(frameAreaSize > 0 && frameAreaSize <= data.length - FRM_HEADER,
    'declared frame area is missing or extends past EOF.');
  assert(FRM_HEADER + frameAreaSize === data.length,
    'frame area size must account for the complete resource.');
  assert(offsets.every((o) => o <= frameAreaSize - FRAME_HEADER),
    'direction offset falls outside frame area.');
  assert(offsets[0] === 0, 'first direction must start at frame-data offset 0.');

  // Repeated zero offsets mean absent orientations, not six identical directions.
  const unique = [...new Set(offsets)];
  const starts = unique.sort((a, b) => a - b);
  const directionSlot = frmDirectionSuffix(fileName);
  const directions: FrmDirection[] = [];
  let totalPixels = 0;
  for (let dirNo = 0; dirNo < starts.length; dirNo++) {
    const start = starts[dirNo];
    const end = dirNo + 1 < starts.length ? starts[dirNo + 1] : frameAreaSize;
    const slot = directionSlot !== null && starts.length === 1 ? directionSlot : offsets.indexOf(start);
    let position = FRM_HEADER + start;
    const limit = FRM_HEADER + end;
    const frames: FrmFrame[] = [];
    for (let n = 0; n < framesPerDirection; n++) {
      assert(position + FRAME_HEADER <= limit, 'truncated frame header.');
      const width = view.getUint16(position, false);
      const height = view.getUint16(position + 2, false);
      const pixelBytes = view.getUint32(position + 4, false);
      const xOffset = view.getInt16(position + 8, false);
      const yOffset = view.getInt16(position + 10, false);
      assert(width >= 1 && height >= 1 && width <= 2048 && height <= 2048,
        'invalid frame dimensions.');
      assert(pixelBytes === width * height, 'frame pixel byte count differs from width × height.');
      totalPixels += pixelBytes;
      assert(totalPixels <= MAX_FRM_PIXELS, 'decoded frame pixels exceed the 4 MiB budget.');
      position += FRAME_HEADER;
      assert(pixelBytes <= limit - position, 'truncated indexed-pixel payload.');
      frames.push({
        width, height, xOffset, yOffset,
        pixels: data.slice(position, position + pixelBytes),
      });
      position += pixelBytes;
    }
    assert(position === limit, 'direction frame region contains unexplained bytes.');
    directions.push({ slot, xShift: xShifts[slot], yShift: yShifts[slot], frames });
  }

  assert(directions.length >= 1 && directions.length <= 6, 'invalid number of orientations.');
  return { version, fps, actionFrame, framesPerDirection, directions };
}

export function parsePal(data: Uint8Array, label = 'color.pal',
  source: 'embedded-file' | 'selected-file' = 'selected-file'): RgbPalette {
  assert(data.byteLength >= 768, 'palette must contain at least 768 bytes / 256 RGB entries.');
  const rgba = new Uint8Array(256 * 4);
  for (let index = 0; index < 256; index++) {
    const at = index * 3;
    const dest = index * 4;
    for (let channel = 0; channel < 3; channel++) {
      const value = data[at + channel];
      // Unmapped colors in some retail palettes are >63.
      // Render unmapped entries black rather than pretending their bytes are true RGB8.
      rgba[dest + channel] = value > 63 ? 0 : (value << 2) | (value >>> 4);
    }
    rgba[dest + 3] = index === 0 ? 0 : 255;
  }
  return { rgba, label, source };
}

export function grayscalePalette(): RgbPalette {
  const rgba = new Uint8Array(1024);
  for (let index = 0; index < 256; index++) {
    rgba.set([index, index, index, index === 0 ? 0 : 255], index * 4);
  }
  return { rgba, label: 'Placeholder grayscale • not authentic game colors', source: 'grayscale' };
}

/** Stateless pixel conversion. Index zero is transparent for sprite previews. */
export function renderFrmPixels(frame: FrmFrame, palette: RgbPalette): Uint8ClampedArray {
  assert(frame.pixels.length === frame.width * frame.height, 'frame pixel buffer length mismatch.');
  assert(palette.rgba.byteLength === 1024, 'palette must define exactly 256 RGBA colors.');
  const out = new Uint8ClampedArray(frame.pixels.length * 4);
  for (let i = 0; i < frame.pixels.length; i++) {
    const at = frame.pixels[i] * 4;
    out[i * 4] = palette.rgba[at];
    out[i * 4 + 1] = palette.rgba[at + 1];
    out[i * 4 + 2] = palette.rgba[at + 2];
    out[i * 4 + 3] = palette.rgba[at + 3];
  }
  return out;
}
