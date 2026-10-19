/**
 * Small original STORE-only ZIP writer. No dependencies, no compression,
 * no directory writes. Each entry uses CRC-32, UTF-8 names, and fixed timestamps.
 * Every path must be explicitly vetted by the caller.
 */
export interface ZipEntry { path: string; bytes: Uint8Array }
const enc=new TextEncoder();
const MAX_ZIP_ENTRIES=110;
const MAX_ZIP_BYTES=40*1024*1024;
const U16=65535;
function crc32(bytes:Uint8Array):number {
  let crc=0xffffffff;
  for(const byte of bytes) {
    crc^=byte;
    for(let j=0;j<8;j++) crc=(crc>>>1) ^ (crc&1?0xedb88320:0);
  }
  return (crc ^ 0xffffffff)>>>0;
}
function put16(v:DataView,at:number,value:number){v.setUint16(at,value,true);}
function put32(v:DataView,at:number,value:number){v.setUint32(at,value,true);}
function fail(ok:boolean,msg:string):asserts ok{if(!ok)throw Error('ZIP: '+msg);}
export function makeZip(entries:ZipEntry[]):Uint8Array {
  fail(entries.length>=1&&entries.length<=MAX_ZIP_ENTRIES,'entry count must be 1–110.');
  const names=new Set<string>();
  const records=entries.map(entry=>{
    fail(/^[a-zA-Z0-9_/-][a-zA-Z0-9_./ -]*$/.test(entry.path) &&
      !entry.path.startsWith('/') && !entry.path.includes('\\') &&
      entry.path.split('/').every(p=>p.length>0&&p!=='.'&&p!=='..') &&
      !/^[a-z]:/i.test(entry.path),'unsafe archive path.');
    const key=entry.path.toLowerCase();
    fail(!names.has(key),'duplicate archive path.');
    names.add(key);
    fail(entry.bytes instanceof Uint8Array,'resource is not a byte buffer.');
    const filename=enc.encode(entry.path);
    fail(filename.length<=U16,'file name too long.');
    return {name:filename,bytes:entry.bytes,crc:crc32(entry.bytes),offset:0};
  });
  const localSize=records.reduce((sum,r)=>sum+30+r.name.length+r.bytes.length,0);
  const centralSize=records.reduce((sum,r)=>sum+46+r.name.length,0);
  const total=localSize+centralSize+22;
  fail(total<=MAX_ZIP_BYTES,'archive exceeds the 40 MiB safety limit.');
  const result=new Uint8Array(total);
  const view=new DataView(result.buffer);
  let cursor=0;
  // DOS timestamp pinned at 1980-01-01 00:00, deterministic.
  for(const record of records) {
    record.offset=cursor;
    put32(view,cursor,0x04034b50);put16(view,cursor+4,20);
    put16(view,cursor+6,0x0800);put16(view,cursor+8,0);
    put16(view,cursor+10,0);put16(view,cursor+12,33);
    put32(view,cursor+14,record.crc);
    put32(view,cursor+18,record.bytes.length);
    put32(view,cursor+22,record.bytes.length);
    put16(view,cursor+26,record.name.length);put16(view,cursor+28,0);
    cursor+=30;
    result.set(record.name,cursor);cursor+=record.name.length;
    result.set(record.bytes,cursor);cursor+=record.bytes.length;
  }
  const directoryOffset=cursor;
  for(const record of records){
    put32(view,cursor,0x02014b50);put16(view,cursor+4,20);put16(view,cursor+6,20);
    put16(view,cursor+8,0x0800);put16(view,cursor+10,0);
    put16(view,cursor+12,0);put16(view,cursor+14,33);
    put32(view,cursor+16,record.crc);put32(view,cursor+20,record.bytes.length);
    put32(view,cursor+24,record.bytes.length);
    put16(view,cursor+28,record.name.length);put16(view,cursor+30,0);
    put16(view,cursor+32,0);put16(view,cursor+34,0);
    put16(view,cursor+36,0);put32(view,cursor+38,0);
    put32(view,cursor+42,record.offset);
    cursor+=46;result.set(record.name,cursor);cursor+=record.name.length;
  }
  const actualCentralSize=cursor-directoryOffset;
  fail(actualCentralSize===centralSize,'central directory size mismatch.');
  put32(view,cursor,0x06054b50);put16(view,cursor+4,0);put16(view,cursor+6,0);
  put16(view,cursor+8,records.length);put16(view,cursor+10,records.length);
  put32(view,cursor+12,centralSize);put32(view,cursor+16,directoryOffset);
  put16(view,cursor+20,0);cursor+=22;
  fail(cursor===result.length,'output length mismatch.');
  return result;
}
