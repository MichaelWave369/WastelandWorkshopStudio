import { describe, expect, it } from 'vitest';
import { parseFrm, parsePal } from './frm';
import {
  createSpriteProject, addSpriteDirection, addSpriteFrame, removeSpriteFrame,
  encodeFrm, encodePal, projectPalette, fromFrm, toSpriteJson, fromSpriteJson,
  validateSprite, setPixel,
} from './spriteProject';

describe('Sprite Creation Lab v0.5', () => {
  it('generates a valid original frame and matching 6-bit PAL', () => {
    const project = createSpriteProject();
    const frm = encodeFrm(project);
    const parsed = parseFrm(frm, 'sprite.frm');
    expect(parsed.directions).toHaveLength(1);
    expect(parsed.framesPerDirection).toBe(3);
    expect(parsed.directions[0].frames[0].pixels).toEqual(project.directions[0].frames[0].pixels);
    expect(encodePal(project)).toHaveLength(768);
    const palette = parsePal(encodePal(project));
    expect(palette.rgba[7]).toBe(255);
    expect(palette.rgba[3]).toBe(0);
  });
  it('round trips 3 directions with synced 4 frame timelines and offsets', () => {
    let project = createSpriteProject(20, 16);
    project = addSpriteDirection(addSpriteDirection(project));
    project = addSpriteFrame(project, 1);
    project.directions[2].xShift = -8;
    project.directions[1].frames[3].xOffset = 7;
    project.actionFrame = 3;
    validateSprite(project);
    const frm = parseFrm(encodeFrm(project), 'original.frm');
    expect(frm.directions).toHaveLength(3);
    expect(frm.directions.map(d => d.frames.length)).toEqual([4, 4, 4]);
    expect(frm.directions[2].xShift).toBe(-8);
    expect(frm.directions[1].frames[3].xOffset).toBe(7);
    expect(frm.actionFrame).toBe(3);
    const loaded = fromFrm(frm, 'original.frm', projectPalette(project));
    expect(encodeFrm(loaded)).toEqual(encodeFrm(project));
  });
  it('keeps synchronized frame counts when deleting and adding', () => {
    let project = addSpriteDirection(createSpriteProject());
    project = removeSpriteFrame(project, 1);
    expect(project.directions.map(d => d.frames.length)).toEqual([2, 2]);
    project = addSpriteFrame(project, 0);
    expect(project.directions.map(d => d.frames.length)).toEqual([3, 3]);
    project = removeSpriteFrame(project, 2);
    project = removeSpriteFrame(project, 1);
    expect(() => removeSpriteFrame(project, 0)).toThrow(/at least one frame/);
  });
  it('can edit isolated pixels while keeping prior frames unchanged', () => {
    const first = createSpriteProject(8, 8);
    const old = first.directions[0].frames[0].pixels[1];
    const next = setPixel(first, 0, 0, 1, 0, 254);
    expect(first.directions[0].frames[0].pixels[1]).toBe(old);
    expect(next.directions[0].frames[0].pixels[1]).toBe(254);
    expect(next.directions[0].frames[1].pixels).toEqual(first.directions[0].frames[1].pixels);
  });
  it('saves an editable, portable project JSON without losing pixels', () => {
    const project = setPixel(createSpriteProject(), 0, 1, 3, 4, 7);
    const json = toSpriteJson(project);
    const saved = fromSpriteJson(json);
    expect(saved.name).toBe(project.name);
    expect(encodeFrm(saved)).toEqual(encodeFrm(project));
    expect(encodePal(saved)).toEqual(encodePal(project));
  });
  it('refuses JSON with invalid pixel indices, dimensions and extra directions', () => {
    const raw=JSON.parse(toSpriteJson(createSpriteProject()));
    raw.directions[0].frames[0].pixels[0] = 256;
    expect(() => fromSpriteJson(JSON.stringify(raw))).toThrow(/invalid indexed pixel/);
    const oversized=JSON.parse(toSpriteJson(createSpriteProject()));
    oversized.width=1000;
    expect(() => fromSpriteJson(JSON.stringify(oversized))).toThrow(/dimensions/);
    expect(() => createSpriteProject(100, 16)).toThrow(/64/);
  });
  it('refuses invalid metadata and inconsistent frame counts before export', () => {
    const project = addSpriteDirection(createSpriteProject());
    project.directions[1].frames.pop();
    expect(() => encodeFrm(project)).toThrow(/same number of frames/);
    const bad = createSpriteProject();
    bad.fps = 0;
    expect(() => encodeFrm(bad)).toThrow(/FPS/);
    const altered = createSpriteProject();
    altered.directions[0].frames[0].pixels = new Uint8Array(3);
    expect(() => encodeFrm(altered)).toThrow(/dimensions/);
  });
  it('caps directions at six and animation at sixteen frames', () => {
    let project = createSpriteProject();
    for (let i=1; i<6; i++) project=addSpriteDirection(project);
    expect(project.directions.length).toBe(6);
    expect(() => addSpriteDirection(project)).toThrow(/maximum/);
    project = createSpriteProject();
    for (let i=3; i<16; i++) project=addSpriteFrame(project, 0);
    expect(project.directions[0].frames).toHaveLength(16);
    expect(() => addSpriteFrame(project, 0)).toThrow(/maximum/);
  });
  it('uses one-size-only authoring and rejects variable-dimension imported assets', () => {
    const project=createSpriteProject();
    const frm=parseFrm(encodeFrm(project));
    frm.directions[0].frames[1].width=5;
    expect(() => fromFrm(frm, 'broken.frm')).toThrow(/identical/);
  });
});
