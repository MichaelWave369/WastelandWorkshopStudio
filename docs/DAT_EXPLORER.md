# Classic Vault Explorer v0.2 (read-only)

Independent implementation of documented Fallout 1 and Fallout 2 archive structures. No game assets, executable binaries or copied decoder code.

Format reference: https://github.com/rotators/fallout2-docs/blob/master/content/pages/dat.md

## Supported
- **DAT1 / Fallout 1:** big-endian metadata at the front; list and download plain (attribute 0x20) and LZSS-compressed (attribute 0x40) entries.
- **DAT2 / Fallout 2:** little-endian index at the end; list files and download plain / zlib-compressed entries through the browser's native DecompressionStream.
- Display folders, file type categories, offsets and compressed/uncompressed sizes. Preview text and a bounded hex prefix of binary entries.
- Manual local .dat file selection only, structural auto-detection, optional forced format.
- Browser never edits the DAT. Single-entry explicit downloads only. No game installation, no bulk extraction.
- File max 2 GiB; index max 32 MiB; 150,000 records max; output max 24 MiB per resource.
- Explicit refusals for bad paths, invalid offsets, malformed indexes, unknown flags and inflated-size mismatches.

## Not yet supported
- **DAT1 LZSS** entry decompression. Entries are indexable, but extraction and preview are blocked until format-specific fixture tests exist.
- FRM/PAL/MAP renderers, DAT writes, whole-folder extraction, gameplay compatibility or automatic mod installation.
- Tests run against synthetic original fixtures. Real shipped game archives must be tested separately with legally owned copies.

## Source provenance
Format fields and general behaviors from community documentation:
https://github.com/rotators/fallout2-docs/blob/master/content/pages/dat.md
https://formats.kaitai.io/fallout2_dat/

No third-party source files copied.
