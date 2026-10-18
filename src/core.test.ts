import { describe, expect, it } from 'vitest';
import { newProject, parseMsg, parseProjectJson, serializeMsg, validateProject } from './core';

describe('classic MSG authoring', () => {
  it('serializes and imports the supported single-line subset', () => {
    const project = newProject('Test', 'fo1');
    const source = serializeMsg(project);
    const parsed = parseMsg(source);
    expect(parsed.errors).toEqual([]);
    expect(parsed.entries.map((line) => line.text)).toEqual(project.entries.map((line) => line.text));
    expect(source).toContain('{100}{}{Welcome to the outpost, traveler.}');
  });
  it('rejects partially unsupported imports rather than silently losing data', () => {
    const parsed = parseMsg('{100}{}{Hello}\n{broken}\n');
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.entries).toHaveLength(1);
  });
  it('refuses duplicate message IDs and unsupported multiline text', () => {
    const project = newProject();
    project.entries[1].number = 100;
    project.entries[2].text = 'Bad\nline';
    expect(validateProject(project).errors.length).toBeGreaterThan(0);
    expect(() => serializeMsg(project)).toThrow();
  });
  it('refuses traversal paths in filenames', () => {
    const project = newProject();
    project.filename = '../master.msg';
    expect(validateProject(project).errors.join(' ')).toMatch(/Filename/);
  });
  it('rejects invalid project JSON records', () => {
    expect(() => parseProjectJson('{"version":1,"name":"x","game":"fo4","filename":"x.msg","entries":[]}')).toThrow();
  });
  it('imports a valid project JSON with a new identity', () => {
    const project = newProject();
    const copy = parseProjectJson(JSON.stringify(project));
    expect(copy.name).toBe(project.name);
    expect(copy.id).not.toBe(project.id);
    expect(copy.entries).toHaveLength(3);
  });
});
