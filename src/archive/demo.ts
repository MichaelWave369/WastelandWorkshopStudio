/**
 * Tiny, original DAT2 fixture for demonstration in GitHub Pages.
 * Contains no Fallout game art, text, or copyrighted resources.
 */
export function makeDemoArchive(): File {
  const encoder = new TextEncoder();
  const items = [
    ['text/english/game/outpost.msg', '{100}{}{Welcome to the training outpost.}\r\n{101}{}{Archive integrity comes first.}\r\n'],
    ['data/config/vault.cfg', '# Wasteland Workshop synthetic DAT2 demo\r\n[workshop]\r\nsafe_mode=true\r\n'],
    ['data/lists/resources.lst', 'outpost.msg\r\nvault.cfg\r\n'],
    ['docs/readme.txt', 'This synthetic archive was created by Wasteland Workshop Studio.\r\nIt contains no game-owned resources.\r\n'],
  ] as const;
  const contentParts: Uint8Array[] = [];
  let offset = 0;
  const tableParts: Uint8Array[] = [];
  const count = new Uint8Array(4);
  new DataView(count.buffer).setUint32(0, items.length, true);
  tableParts.push(count);
  for (const [path, content] of items) {
    const name = encoder.encode(path.replaceAll('/', '\\'));
    const payload = encoder.encode(content);
    const record = new Uint8Array(4 + name.length + 13);
    const view = new DataView(record.buffer);
    view.setUint32(0, name.length, true);
    record.set(name, 4);
    record[4 + name.length] = 0; // plain
    view.setUint32(name.length + 5, payload.length, true);
    view.setUint32(name.length + 9, payload.length, true);
    view.setUint32(name.length + 13, offset, true);
    offset += payload.length;
    contentParts.push(payload);
    tableParts.push(record);
  }
  const indexSize = tableParts.reduce((total, part) => total + part.length, 0);
  const footer = new Uint8Array(8);
  const footerView = new DataView(footer.buffer);
  footerView.setUint32(0, indexSize, true);
  footerView.setUint32(4, offset + indexSize + 8, true);
  const joined = new Uint8Array(offset + indexSize + footer.length);
  let cursor = 0;
  for (const part of [...contentParts, ...tableParts, footer]) {
    joined.set(part, cursor);
    cursor += part.length;
  }
  return new File([joined], 'workshop-demo.dat', { type: 'application/octet-stream' });
}


/** Hand-authored miniature DAT1 fixture, using original dialogue and only literal LZSS tokens. */
export function makeDat1DemoArchive(): File {
  const encode = new TextEncoder();
  const folderNames = ['.', 'text\\english\\game'];
  const readme = encode.encode('DAT1 workshop demonstration.\r\nNo copyrighted game content included.\r\n');
  const dialogue = encode.encode('{100}{}{Fallout 1 style archives are readable.}\r\n{101}{}{This is original demo dialogue.}\r\n');

  // Literal-token LZSS encoder exists only to generate the synthetic demo fixture.
  const lzss: number[] = [];
  for (let offset = 0; offset < dialogue.length; offset += 8) {
    const slice = dialogue.subarray(offset, offset + 8);
    lzss.push((1 << slice.length) - 1, ...slice);
  }
  const packed = Uint8Array.from([
    (lzss.length >>> 8) & 255, lzss.length & 255,
    ...lzss,
    0, 0,
  ]);
  const resources = [
    { directory: 0, filename: 'readme.txt', plain: readme, payload: readme, compressed: false },
    { directory: 1, filename: 'outpost.msg', plain: dialogue, payload: packed, compressed: true },
  ];
  const names = folderNames.map((name) => encode.encode(name));
  const fileNames = resources.map((item) => encode.encode(item.filename));
  const metadataSize = 16 + names.reduce((total, name) => total + 1 + name.length, 0)
    + folderNames.length * 16
    + fileNames.reduce((total, name) => total + 1 + name.length + 16, 0);
  const payloadLength = resources.reduce((total, entry) => total + entry.payload.length, 0);
  const result = new Uint8Array(metadataSize + payloadLength);
  const view = new DataView(result.buffer);
  const be32 = (where: number, value: number) => view.setUint32(where, value, false);
  be32(0, names.length);
  be32(4, names.length);
  let cursor = 16;
  for (const name of names) {
    result[cursor++] = name.length;
    result.set(name, cursor);
    cursor += name.length;
  }
  let payloadStart = metadataSize;
  for (let folder = 0; folder < names.length; folder += 1) {
    const children = resources.map((entry, index) => ({ entry, index })).filter((value) => value.entry.directory === folder);
    be32(cursor, children.length);
    be32(cursor + 4, children.length);
    be32(cursor + 8, 16);
    cursor += 16;
    for (const { entry, index } of children) {
      const name = fileNames[index];
      result[cursor++] = name.length;
      result.set(name, cursor);
      cursor += name.length;
      be32(cursor, entry.compressed ? 0x40 : 0x20);
      be32(cursor + 4, payloadStart);
      be32(cursor + 8, entry.plain.length);
      be32(cursor + 12, entry.compressed ? entry.payload.length : 0);
      cursor += 16;
      result.set(entry.payload, payloadStart);
      payloadStart += entry.payload.length;
    }
  }
  if (cursor !== metadataSize || payloadStart !== result.length) throw new Error('Invalid synthetic demo archive layout.');
  return new File([result], 'workshop-dat1-demo.dat', { type: 'application/octet-stream' });
}
