const encoder = new TextEncoder();

export interface StoredZipEntry {
  name: string;
  content: string | Uint8Array;
}

export function createStoredZip(entries: StoredZipEntry[], timestamp = new Date()): Uint8Array {
  const body: number[] = [];
  const directory: number[] = [];
  const { date, time } = dosDateTime(timestamp);

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = typeof entry.content === "string" ? encoder.encode(entry.content) : entry.content;
    const crc = crc32(data);
    const offset = body.length;

    u32(body, 0x04034b50); u16(body, 20); u16(body, 0x0800); u16(body, 0);
    u16(body, time); u16(body, date); u32(body, crc); u32(body, data.length); u32(body, data.length);
    u16(body, name.length); u16(body, 0); bytes(body, name); bytes(body, data);

    u32(directory, 0x02014b50); u16(directory, 20); u16(directory, 20); u16(directory, 0x0800); u16(directory, 0);
    u16(directory, time); u16(directory, date); u32(directory, crc); u32(directory, data.length); u32(directory, data.length);
    u16(directory, name.length); u16(directory, 0); u16(directory, 0); u16(directory, 0); u16(directory, 0);
    u32(directory, 0); u32(directory, offset); bytes(directory, name);
  }

  const directoryOffset = body.length;
  body.push(...directory);
  u32(body, 0x06054b50); u16(body, 0); u16(body, 0); u16(body, entries.length); u16(body, entries.length);
  u32(body, directory.length); u32(body, directoryOffset); u16(body, 0);
  return Uint8Array.from(body);
}

function bytes(target: number[], value: Uint8Array): void {
  for (const byte of value) target.push(byte);
}
function u16(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}
function u32(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}
function dosDateTime(value: Date): { date: number; time: number } {
  const year = Math.max(1980, value.getUTCFullYear());
  return {
    date: ((year - 1980) << 9) | ((value.getUTCMonth() + 1) << 5) | value.getUTCDate(),
    time: (value.getUTCHours() << 11) | (value.getUTCMinutes() << 5) | Math.floor(value.getUTCSeconds() / 2),
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[index] = crc >>> 0;
  }
  return table;
})();
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
