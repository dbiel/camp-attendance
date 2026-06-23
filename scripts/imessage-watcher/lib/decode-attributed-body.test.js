import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decodeAttributedBody } from './decode-attributed-body.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'attributed-body.json'), 'utf8')
);

describe('decodeAttributedBody', () => {
  it('has real ground-truth fixtures to validate against', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
  });

  for (const [i, fx] of fixtures.entries()) {
    it(`fixture ${i} (byte-len ${Buffer.byteLength(fx.expected)}) decodes to its known text`, () => {
      const buf = Buffer.from(fx.hex, 'hex');
      expect(decodeAttributedBody(buf)).toBe(fx.expected);
    });
  }

  it('handles a single-byte length payload', () => {
    // NSString ... + (0x2B) <len=5> "hello"
    const buf = Buffer.concat([
      Buffer.from('NSString', 'utf8'),
      Buffer.from([0x01, 0x95, 0x84, 0x01, 0x2b, 0x05]),
      Buffer.from('hello', 'utf8'),
    ]);
    expect(decodeAttributedBody(buf)).toBe('hello');
  });

  it('handles a two-byte (0x81) length payload', () => {
    const body = 'x'.repeat(200);
    const len = Buffer.byteLength(body); // 200 = 0xC8
    const buf = Buffer.concat([
      Buffer.from('NSString', 'utf8'),
      Buffer.from([0x01, 0x95, 0x84, 0x01, 0x2b, 0x81, len & 0xff, (len >> 8) & 0xff]),
      Buffer.from(body, 'utf8'),
    ]);
    expect(decodeAttributedBody(buf)).toBe(body);
  });

  it('returns "" for a garbage buffer', () => {
    expect(decodeAttributedBody(Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]))).toBe('');
  });

  it('returns "" for an empty buffer', () => {
    expect(decodeAttributedBody(Buffer.alloc(0))).toBe('');
  });

  it('returns "" for a non-buffer input', () => {
    expect(decodeAttributedBody(null)).toBe('');
    expect(decodeAttributedBody(undefined)).toBe('');
  });
});
