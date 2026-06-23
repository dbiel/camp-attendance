/**
 * Decode the text of a macOS Messages `attributedBody` blob.
 *
 * When `message.text` is NULL, the plain text lives inside the
 * `attributedBody` column as a `streamtyped` (NSArchiver / typedstream)
 * binary blob holding an NSAttributedString. We don't need a full
 * typedstream parser — the message text is the first NSString payload,
 * which appears right after the `NSString` class marker.
 *
 * Layout we rely on (verified against real chat.db fixtures):
 *
 *   ... "NSString" <class/version bytes> 0x84 0x01 0x2B <length> <utf8 bytes> ...
 *
 * The 0x2B (`+`) byte is the typedstream type tag for the string field.
 * The length immediately follows:
 *   - length < 128            → a single byte
 *   - length >= 128           → 0x81 then a 2-byte little-endian length
 * The length counts UTF-8 *bytes*, not characters.
 *
 * On ANY parse failure this returns '' so the caller can store the row
 * with `decode_failed: true` rather than dropping it.
 *
 * @param {Buffer} buffer
 * @returns {string}
 */
export function decodeAttributedBody(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return '';

  try {
    const marker = Buffer.from('NSString', 'utf8');
    const nsIdx = buffer.indexOf(marker);
    if (nsIdx === -1) return '';

    // Find the 0x2B (`+`) type tag that introduces the string field, scanning
    // forward from the end of the NSString marker. It sits within a few bytes
    // (e.g. `01 95 84 01 2B`). Bound the scan so a stray 0x2B deep in the blob
    // (e.g. inside the message text itself) can't be mistaken for the tag.
    const scanStart = nsIdx + marker.length;
    const scanEnd = Math.min(scanStart + 12, buffer.length);
    let plus = -1;
    for (let i = scanStart; i < scanEnd; i++) {
      if (buffer[i] === 0x2b) {
        plus = i;
        break;
      }
    }
    if (plus === -1) return '';

    let pos = plus + 1;
    if (pos >= buffer.length) return '';

    // Read the length.
    let length;
    const first = buffer[pos];
    if (first === 0x81) {
      // 2-byte little-endian length follows the 0x81 prefix.
      if (pos + 2 >= buffer.length) return '';
      length = buffer[pos + 1] | (buffer[pos + 2] << 8);
      pos += 3;
    } else if (first < 0x80) {
      length = first;
      pos += 1;
    } else {
      // Unexpected length encoding.
      return '';
    }

    if (length <= 0) return '';
    if (pos + length > buffer.length) return '';

    const text = buffer.toString('utf8', pos, pos + length);
    // A valid decode shouldn't contain the U+FFFD replacement char unless the
    // original did (attachment placeholders use U+FFFC, which is legitimate).
    return text;
  } catch {
    return '';
  }
}
