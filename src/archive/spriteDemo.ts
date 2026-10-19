/**
 * Entirely synthetic FRM/PAL DAT2 demonstration. No Fallout-owned pixels,
 * palette files, or dialogue are copied into this repository.
 */
function syntheticPalette(): Uint8Array {
  const p = new Uint8Array(768);
  const set = (index: number, r: number, g: number, b: number) => p.set([r, g, b], index * 3);
  set(1, 5, 15, 7);  // outline
  set(2, 13, 61, 10); // green
  set(3, 63, 55, 6); // yellow
  set(4, 51, 22, 7); // orange
  set(5, 25, 46, 56); // blue-green
  set(6, 63, 63, 59); // cream
  return p;
}

function syntheticFrm(): Uint8Array {
  const framesPerDirection = 4;
  const width = 19;
  const height = 19;
  const frameSize = 12 + width * height;
  const output = new Uint8Array(62 + 2 * framesPerDirection * frameSize);
  const header = new DataView(output.buffer);
  header.setUint32(0, 4, false);
  header.setUint16(4, 7, false);
  header.setUint16(6, 0, false);
  header.setUint16(8, framesPerDirection, false);
  header.setInt16(12, 2, false);  // orientation 1 centre x-shift
  header.setUint32(34, 0, false);
  header.setUint32(38, framesPerDirection * frameSize, false);
  header.setUint32(58, 2 * framesPerDirection * frameSize, false);

  let cursor = 62;
  for (let direction = 0; direction < 2; direction++) {
    for (let frame = 0; frame < framesPerDirection; frame++) {
      header.setUint16(cursor, width, false);
      header.setUint16(cursor + 2, height, false);
      header.setUint32(cursor + 4, width * height, false);
      header.setInt16(cursor + 8, frame === 0 ? 0 : (direction === 0 ? 1 : -1), false);
      header.setInt16(cursor + 10, 0, false);
      cursor += 12;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dx = x - 9;
          const dy = y - 9;
          const squared = dx * dx + dy * dy;
          const angle = Math.atan2(dy, dx) + frame * (Math.PI / 7) + direction * 0.35;
          const radial = Math.sin(3 * angle) > 0.25;
          let pixel = 0;
          if (squared <= 80 && squared >= 63) pixel = 1;
          else if (squared < 50 && squared > 17 && radial) pixel = frame % 2 ? 3 : 2;
          else if (squared <= 11 && squared >= 5) pixel = 1;
          else if (squared <= 4) pixel = 6;
          else if (y >= 16 && x >= 6 && x <= 12) pixel = direction ? 4 : 5;
          output[cursor++] = pixel;
        }
      }
    }
  }
  return output;
}

export function makeSpriteDemoArchive(): File {
  const enc = new TextEncoder();
  const files: Array<[string, Uint8Array]> = [
    ['art/items/workshop.frm', syntheticFrm()],
    ['color.pal', syntheticPalette()],
    ['docs/sprite-demo.txt', enc.encode('Original synthetic Fallout-style sprite test.\r\nFour frames, two orientations, and a matching six-bit palette.\r\n')],
  ];
  let totalPayload = 0;
  const payloads: Uint8Array[] = [];
  const directoryParts: Uint8Array[] = [];
  const count = new Uint8Array(4);
  new DataView(count.buffer).setUint32(0, files.length, true);
  directoryParts.push(count);
  for (const [path, bytes] of files) {
    const encodedPath = enc.encode(path.replaceAll('/', '\\'));
    const record = new Uint8Array(4 + encodedPath.length + 13);
    const view = new DataView(record.buffer);
    view.setUint32(0, encodedPath.length, true);
    record.set(encodedPath, 4);
    record[encodedPath.length + 4] = 0; // uncompressed
    view.setUint32(encodedPath.length + 5, bytes.length, true);
    view.setUint32(encodedPath.length + 9, bytes.length, true);
    view.setUint32(encodedPath.length + 13, totalPayload, true);
    directoryParts.push(record);
    payloads.push(bytes);
    totalPayload += bytes.length;
  }
  const treeSize = directoryParts.reduce((n, p) => n + p.length, 0);
  const footer = new Uint8Array(8);
  const tail = new DataView(footer.buffer);
  tail.setUint32(0, treeSize, true);
  tail.setUint32(4, totalPayload + treeSize + 8, true);
  const result = new Uint8Array(totalPayload + treeSize + 8);
  let cursor = 0;
  for (const part of [...payloads, ...directoryParts, footer]) {
    result.set(part, cursor);
    cursor += part.length;
  }
  return new File([result], 'sprite-lab-demo.dat', { type: 'application/octet-stream' });
}
