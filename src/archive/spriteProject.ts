import { parsePal, type FrmImage, type RgbPalette } from './frm';

export const SPRITE_STORAGE_KEY = 'wws:sprite-lab:v1';
export const MAX_SPRITE_DIMENSION = 64;
export const MAX_SPRITE_FRAMES = 16;
export const MAX_SPRITE_DIRECTIONS = 6;
export const MAX_SPRITE_JSON_BYTES = 2 * 1024 * 1024;

export type EditFrame = { pixels: Uint8Array; xOffset: number; yOffset: number };
export type EditDirection = { slot: number; xShift: number; yShift: number; frames: EditFrame[] };
export type SpriteProject = {
  version: 1;
  name: string;
  width: number;
  height: number;
  fps: number;
  actionFrame: number;
  palette: Uint8Array; // exactly 768 color-channel values in native 6-bit range
  directions: EditDirection[];
};
function verify(ok: boolean, reason: string): asserts ok {
  if (!ok) throw new Error('Sprite Lab: ' + reason);
}
function intIn(value: number, low: number, high: number): boolean {
  return Number.isSafeInteger(value) && value >= low && value <= high;
}
function makeDefaultPalette(): Uint8Array {
  const colors: Array<[number, number, number]> = [
    [0, 0, 0], [5, 13, 7], [17, 47, 21], [37, 62, 25],
    [61, 54, 9], [58, 33, 8], [46, 19, 16], [29, 40, 51],
    [62, 62, 57], [37, 30, 22], [16, 23, 28], [54, 48, 32],
    [24, 55, 45], [34, 24, 54], [48, 42, 59], [63, 63, 63],
  ];
  const bytes = new Uint8Array(768);
  colors.forEach((color, index) => bytes.set(color, index * 3));
  return bytes;
}
function blankFrame(width: number, height: number): EditFrame {
  return { pixels: new Uint8Array(width * height), xOffset: 0, yOffset: 0 };
}
function copyFrame(source: EditFrame): EditFrame {
  return { pixels: source.pixels.slice(), xOffset: source.xOffset, yOffset: source.yOffset };
}
export function createSpriteProject(width = 24, height = 24): SpriteProject {
  verify(intIn(width, 1, MAX_SPRITE_DIMENSION) && intIn(height, 1, MAX_SPRITE_DIMENSION),
    'canvas dimensions must be between 1 and 64.');
  const frames = Array.from({ length: 3 }, (_, stage) => {
    const frame = blankFrame(width, height);
    // Small, original reactor-ring icon makes the editor instantly testable.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const dx = (x + .5 - width / 2) / Math.min(width, height);
      const dy = (y + .5 - height / 2) / Math.min(width, height);
      const r = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) + stage * Math.PI / 5;
      const i = y * width + x;
      if (r > .29 && r < .38) frame.pixels[i] = 1;
      else if (r > .13 && r < .29 && Math.sin(angle * 3) > .3) frame.pixels[i] = 3;
      else if (r < .115) frame.pixels[i] = 4;
    }
    return frame;
  });
  return { version: 1, name: 'Original Wasteland Sprite', width, height,
    fps: 8, actionFrame: 0, palette: makeDefaultPalette(),
    directions: [{ slot: 0, xShift: 0, yShift: 0, frames }] };
}
export function validateSprite(project: SpriteProject): void {
  verify(project.version === 1, 'unsupported sprite-project version.');
  verify(typeof project.name === 'string' && project.name.trim().length >= 1 && project.name.length <= 80,
    'project name must be between 1 and 80 characters.');
  verify(intIn(project.width, 1, MAX_SPRITE_DIMENSION) && intIn(project.height, 1, MAX_SPRITE_DIMENSION),
    'canvas size must fit within 64 × 64 pixels.');
  verify(intIn(project.fps, 1, 30), 'animation FPS must be 1 to 30.');
  verify(project.palette instanceof Uint8Array && project.palette.length === 768
    && project.palette.every((value) => value <= 63), 'palette must contain exactly 768 six-bit channel values.');
  verify(Array.isArray(project.directions)
    && project.directions.length >= 1 && project.directions.length <= MAX_SPRITE_DIRECTIONS,
    'sprite must contain between 1 and 6 directions.');
  const length = project.directions[0]?.frames?.length ?? 0;
  verify(intIn(length, 1, MAX_SPRITE_FRAMES), 'each orientation must contain 1–16 frames.');
  verify(intIn(project.actionFrame, 0, length - 1), 'action frame must reference an existing frame.');
  project.directions.forEach((direction, index) => {
    verify(direction.slot === index, 'direction slots must be contiguous starting at zero.');
    verify(intIn(direction.xShift, -2048, 2047) && intIn(direction.yShift, -2048, 2047),
      'orientation shift must be within supported bounds.');
    verify(Array.isArray(direction.frames) && direction.frames.length === length,
      'all orientations must contain exactly the same number of frames.');
    direction.frames.forEach((frame) => {
      verify(frame.pixels instanceof Uint8Array && frame.pixels.length === project.width * project.height,
        'frame buffer dimensions are inconsistent.');
      verify(intIn(frame.xOffset, -2048, 2047) && intIn(frame.yOffset, -2048, 2047),
        'frame shift must be within supported bounds.');
    });
  });
}

export function addSpriteFrame(project: SpriteProject, selectedFrame: number): SpriteProject {
  validateSprite(project);
  verify(project.directions[0].frames.length < MAX_SPRITE_FRAMES, 'maximum of 16 frames reached.');
  verify(intIn(selectedFrame, 0, project.directions[0].frames.length - 1), 'invalid selected frame.');
  const result: SpriteProject = { ...project, directions: project.directions.map((dir) => {
    const frames = dir.frames.slice();
    frames.splice(selectedFrame + 1, 0, copyFrame(dir.frames[selectedFrame]));
    return { ...dir, frames };
  }) };
  return result;
}
export function removeSpriteFrame(project: SpriteProject, selectedFrame: number): SpriteProject {
  validateSprite(project);
  verify(project.directions[0].frames.length > 1, 'at least one frame is required.');
  verify(intIn(selectedFrame, 0, project.directions[0].frames.length - 1), 'invalid selected frame.');
  const result: SpriteProject = {
    ...project, actionFrame: Math.min(project.actionFrame, project.directions[0].frames.length - 2),
    directions: project.directions.map((dir) => ({
      ...dir, frames: dir.frames.filter((_, index) => index !== selectedFrame),
    })),
  };
  return result;
}
export function addSpriteDirection(project: SpriteProject): SpriteProject {
  validateSprite(project);
  verify(project.directions.length < MAX_SPRITE_DIRECTIONS, 'maximum of 6 directions reached.');
  const source = project.directions[project.directions.length - 1];
  return { ...project, directions: [...project.directions, {
    slot: project.directions.length, xShift: 0, yShift: 0,
    frames: source.frames.map(copyFrame),
  }] };
}

/**
 * Write a strict, uncompressed FRM v4 file matching the existing read-only parser.
 * Separate directions are serialized sequentially and every index is validated first.
 */
export function encodeFrm(project: SpriteProject): Uint8Array {
  validateSprite(project);
  const framesPerDirection = project.directions[0].frames.length;
  const singleFrameSize = 12 + project.width * project.height;
  const frameAreaSize = singleFrameSize * framesPerDirection * project.directions.length;
  const total = 62 + frameAreaSize;
  verify(total <= 24 * 1024 * 1024, 'serialized FRM exceeds the 24 MiB limit.');
  const result = new Uint8Array(total);
  const view = new DataView(result.buffer);
  view.setUint32(0, 4, false);
  view.setUint16(4, project.fps, false);
  view.setUint16(6, project.actionFrame, false);
  view.setUint16(8, framesPerDirection, false);
  view.setUint32(58, frameAreaSize, false);
  let cursor = 62;
  project.directions.forEach((direction, dirIndex) => {
    view.setInt16(10 + dirIndex * 2, direction.xShift, false);
    view.setInt16(22 + dirIndex * 2, direction.yShift, false);
    view.setUint32(34 + dirIndex * 4, cursor - 62, false);
    direction.frames.forEach((frame) => {
      view.setUint16(cursor, project.width, false);
      view.setUint16(cursor + 2, project.height, false);
      view.setUint32(cursor + 4, frame.pixels.length, false);
      view.setInt16(cursor + 8, frame.xOffset, false);
      view.setInt16(cursor + 10, frame.yOffset, false);
      result.set(frame.pixels, cursor + 12);
      cursor += singleFrameSize;
    });
  });
  verify(cursor === total, 'serialized FRM length disagreement.');
  return result;
}
export function encodePal(project: SpriteProject): Uint8Array {
  validateSprite(project);
  return project.palette.slice();
}
export function projectPalette(project: SpriteProject): RgbPalette {
  return parsePal(project.palette, project.name + '.pal', 'selected-file');
}
export function fromFrm(image: FrmImage, projectName: string, palette?: RgbPalette): SpriteProject {
  verify(image.version === 4, 'only FRM v4 can be imported.');
  const first = image.directions[0]?.frames[0];
  verify(!!first, 'FRM has no frames.');
  verify(image.directions.every((dir) => dir.frames.every((frame) =>
    frame.width === first.width && frame.height === first.height)),
  'v0.5 editor requires identical frame dimensions.');
  verify(image.directions.length <= MAX_SPRITE_DIRECTIONS
    && image.directions.every((dir, index) => dir.slot === index || image.directions.length === 1),
  'unsupported orientation layout for this editor.');
  verify(image.framesPerDirection <= MAX_SPRITE_FRAMES,
    'v0.5 editor supports at most 16 frames per orientation.');
  const channels = makeDefaultPalette();
  if (palette) for (let i = 0; i < 256; i++) for (let channel = 0; channel < 3; channel++) {
    channels[i * 3 + channel] = Math.min(63, Math.round(palette.rgba[i * 4 + channel] * 63 / 255));
  }
  const project: SpriteProject = {
    version: 1, name: projectName.replace(/\.(frm|fr[0-5])$/i, '').slice(0, 80) || 'Imported Sprite',
    width: first.width, height: first.height, fps: Math.max(1, Math.min(30, image.fps || 8)),
    actionFrame: Math.min(image.actionFrame, image.framesPerDirection - 1), palette: channels,
    directions: image.directions.map((dir, index) => ({
      slot: index, xShift: dir.xShift, yShift: dir.yShift,
      frames: dir.frames.map((frame) => ({
        pixels: frame.pixels.slice(), xOffset: frame.xOffset, yOffset: frame.yOffset,
      })),
    })),
  };
  validateSprite(project);
  return project;
}

export function toSpriteJson(project: SpriteProject): string {
  validateSprite(project);
  return JSON.stringify({
    ...project, palette: Array.from(project.palette),
    directions: project.directions.map((dir) => ({
      ...dir, frames: dir.frames.map((frame) => ({ ...frame, pixels: Array.from(frame.pixels) })),
    })),
  }, null, 2) + '\n';
}
export function fromSpriteJson(text: string): SpriteProject {
  verify(text.length <= MAX_SPRITE_JSON_BYTES, 'JSON is over the 2 MiB limit.');
  const raw: unknown = JSON.parse(text);
  verify(raw !== null && typeof raw === 'object', 'JSON root must be a sprite project.');
  const value = raw as Record<string, unknown>;
  verify(value.version === 1 && Array.isArray(value.palette) && value.palette.length === 768,
    'invalid sprite project header/palette.');
  verify(value.palette.every((c: unknown) => intIn(c as number, 0, 63)),
    'palette contains invalid six-bit values.');
  verify(Array.isArray(value.directions) && value.directions.length >= 1 && value.directions.length <= 6,
    'invalid sprite orientations.');
  const width = value.width as number;
  const height = value.height as number;
  verify(intIn(width, 1, 64) && intIn(height, 1, 64),
    'invalid editor dimensions.');
  const directions: EditDirection[] = value.directions.map((v: unknown) => {
    verify(v !== null && typeof v === 'object', 'invalid orientation.');
    const direction = v as Record<string, unknown>;
    verify(Array.isArray(direction.frames) && direction.frames.length <= 16,
      'invalid frame count.');
    const frames: EditFrame[] = direction.frames.map((f: unknown) => {
      verify(f !== null && typeof f === 'object', 'invalid frame.');
      const frame = f as Record<string, unknown>;
      verify(Array.isArray(frame.pixels) && frame.pixels.length === width * height
        && frame.pixels.every((n: unknown) => intIn(n as number, 0, 255)),
      'invalid indexed pixel buffer.');
      return { pixels: Uint8Array.from(frame.pixels as number[]),
        xOffset: frame.xOffset as number, yOffset: frame.yOffset as number };
    });
    return { slot: direction.slot as number, xShift: direction.xShift as number,
      yShift: direction.yShift as number, frames };
  });
  const project: SpriteProject = {
    version: 1, name: value.name as string, width, height,
    fps: value.fps as number, actionFrame: value.actionFrame as number,
    palette: Uint8Array.from(value.palette as number[]), directions,
  };
  validateSprite(project);
  return project;
}
export function setPixel(project: SpriteProject, direction: number, frame: number,
  x: number, y: number, paletteIndex: number): SpriteProject {
  verify(intIn(x, 0, project.width - 1) && intIn(y, 0, project.height - 1)
    && intIn(paletteIndex, 0, 255), 'pixel coordinates or palette index are invalid.');
  verify(!!project.directions[direction]?.frames[frame], 'selected frame does not exist.');
  const directions = project.directions.slice();
  const dir = { ...directions[direction], frames: directions[direction].frames.slice() };
  const current = copyFrame(dir.frames[frame]);
  current.pixels[y * project.width + x] = paletteIndex;
  dir.frames[frame] = current;
  directions[direction] = dir;
  return { ...project, directions };
}
