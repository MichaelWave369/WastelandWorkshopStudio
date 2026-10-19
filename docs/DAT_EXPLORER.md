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

## v0.4 Original Classic Sprite Viewer

- Parses Fallout 1/2 FRM version 4 big-endian headers: frames per orientation, FPS, action frame, per-orientation center shifts, frame-area offsets, frame dimensions, signed per-frame motion offsets and indexed pixels.
- Supports .frm and single-direction .fr0 through .fr5, with explicit frame and orientation controls. Detects populated orientations from distinct frame-region offsets.
- Palette handling: matching same-basename .pal, then a root or nested color.pal, then an explicitly labeled placeholder grayscale. A user-selected .pal overrides auto detection. Reads 256 six-bit RGB entries (first 768 bytes of .pal); index 0 is transparent for sprite previews, and invalid >63 component values are shown as black rather than made-up RGB colors.
- The animation preview uses the FRM frame offsets as cumulative frame motion and the orientation center shift. Original canvas frame PNGs are temporary preview exports, **not** game-installable mods.
- Dedicated original sprite-demo DAT2 archive with a 2-orientation, 4-frame FRM, a matching synthetic .pal, and original README text.
- Standalone local .frm/.fr[0-5] files can be opened without an archive; local .pal files can be supplied. Browser never uploads or modifies user resources.
- Fail-closed budgets: 24 MiB FRM data, 4,194,304 decoded indexed pixels, max 2048 dimensions/frame, maximum 100 frames/orientation, and exact frame region bounds.
- Real retail .frm + .pal compatibility must be checked independently against user-owned game data. Indexed colors, palette animations, lighting/translucency effects and specialized render behaviors are not fully simulated.

Format references: TeamX FRM technical description https://sucs.org/~grepwood/teamx/frm_2.html and FODEV PAL layout https://fodev.net/files/fo2/pal.html.
