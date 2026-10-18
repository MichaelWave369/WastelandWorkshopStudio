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
  return new File([...contentParts, ...tableParts, footer], 'workshop-demo.dat', { type: 'application/octet-stream' });
}
