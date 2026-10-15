// Reads the format and pixel size of an uploaded calque from its first bytes,
// so the server trusts neither the browser's content type nor its numbers
// (ADR 0024). Only PNG and JPEG are accepted: the browser rasterizes every
// other format before upload.

export interface ImageHeader {
  contentType: "image/png" | "image/jpeg";
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const readUint16 = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] << 8) | bytes[offset + 1];

const readUint32 = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]) >>>
  0;

const readPng = (bytes: Uint8Array): ImageHeader | null => {
  if (bytes.length < 24) return null;
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return null;
  }
  // The first chunk of a valid PNG is IHDR: width and height, big-endian.
  const chunkType = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunkType !== "IHDR") return null;
  return {
    contentType: "image/png",
    width: readUint32(bytes, 16),
    height: readUint32(bytes, 20),
  };
};

// Start-of-frame markers carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC)
// share the range but are not frames.
const isStartOfFrame = (marker: number): boolean =>
  marker >= 0xc0 &&
  marker <= 0xcf &&
  marker !== 0xc4 &&
  marker !== 0xc8 &&
  marker !== 0xcc;

const isStandaloneMarker = (marker: number): boolean =>
  marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);

const readJpeg = (bytes: Uint8Array): ImageHeader | null => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      // Fill byte before a marker.
      offset += 1;
      continue;
    }
    if (isStandaloneMarker(marker)) {
      offset += 2;
      continue;
    }
    // Start of scan or end of image before any frame header.
    if (marker === 0xda || marker === 0xd9) return null;

    const length = readUint16(bytes, offset + 2);
    if (length < 2) return null;
    if (isStartOfFrame(marker)) {
      if (offset + 9 > bytes.length) return null;
      return {
        contentType: "image/jpeg",
        height: readUint16(bytes, offset + 5),
        width: readUint16(bytes, offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
};

export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  return readPng(bytes) ?? readJpeg(bytes);
}
