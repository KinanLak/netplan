import { describe, expect, it } from "bun:test";
import { readImageHeader } from "./imageHeader";

const png = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
};

const jpeg = (width: number, height: number, frameMarker = 0xc0) =>
  new Uint8Array([
    0xff,
    0xd8,
    // APP0, 16 bytes including the length.
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    // DHT, which sits in the SOF range but is not a frame.
    0xff,
    0xc4,
    0x00,
    0x03,
    0x00,
    // Fill byte, then the frame header.
    0xff,
    0xff,
    frameMarker,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
  ]);

describe("readImageHeader", () => {
  it("reads a PNG's size from its IHDR chunk", () => {
    expect(readImageHeader(png(1920, 1080))).toEqual({
      contentType: "image/png",
      width: 1920,
      height: 1080,
    });
  });

  it("reads a JPEG's size from its frame header, past other segments", () => {
    expect(readImageHeader(jpeg(4000, 3000))).toEqual({
      contentType: "image/jpeg",
      width: 4000,
      height: 3000,
    });
    expect(readImageHeader(jpeg(640, 480, 0xc2))).toEqual({
      contentType: "image/jpeg",
      width: 640,
      height: 480,
    });
  });

  it("refuses anything else", () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const pdf = new TextEncoder().encode("%PDF-1.7\n%âãÏÓ\n");
    expect(readImageHeader(svg)).toBeNull();
    expect(readImageHeader(pdf)).toBeNull();
    expect(readImageHeader(new Uint8Array())).toBeNull();
    expect(readImageHeader(png(10, 10).subarray(0, 20))).toBeNull();
    expect(
      readImageHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])),
    ).toBeNull();
  });
});
