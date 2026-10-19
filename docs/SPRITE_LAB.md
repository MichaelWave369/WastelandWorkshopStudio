# Sprite Creation Lab v0.5

Original, independent classic Fallout FRM authoring and pixel editor.

## Working features
- One original sprite project in local browser storage, and portable editable `.wwsprite.json` backups.
- New 1–64px width × 1–64px height canvas; mouse/touch painting, index eraser, color picker, and flood fill.
- Frame creation/duplication/deletion, synchronized across directions. Up to 16 frames per direction and six orientations. An original three-frame starter graphic is included.
- 256 indexed palette colors with 6-bit RGB channel editing; palette index zero is transparent. Palette data is imported/exported as a 768-byte `.pal`.
- Playback preview, 1–30 FPS, direct FRM read-only import where frames use a uniform size and fit this authoring subset.
- Export a **standalone uncompressed FRM v4** binary with big-endian metadata and a separate palette resource. All exported bytes are generated independently, and every export is checked by schema validation. The output can be reloaded by the studio's FRM parser.

## Limits and safeguards
- Only uniform frame dimensions are editable. Larger or more complex existing FRMs remain available in the read-only Vault Explorer.
- An imported FRM uses the current project palette unless the user separately loads a correct PAL. Images can appear wrong without the matching game palette.
- The FRM and PAL download buttons create separate local files. No installed Fallout game, DAT archive or project source is mutated. **Writing correct bytes does not establish that a new asset is registered in Fallout or behaves as intended in game.**
- Importers cap JSON at 2 MiB, FRM at 24 MiB and PAL at 512 KiB. JSON is checked for dimensions, frame counts, offsets, palette ranges, and indexed pixels before acceptance.
- Browser localStorage autosave is best effort and may be disabled, cleared or lost. Export JSON regularly. No networking, game scanning, or game assets in the repo.
- The editor does not yet support palettes with color cycling, specialized engine effects, registration into game PRO/LST references, DAT repacking, or complete mod installation.

## Testing
Synthetic fixtures validate native FRM v4 big-endian serialization by decoding exports back through our FRM parser and confirming indexed pixels, dimensions, directions, offsets, and frame counts. Malformed JSON and unsupported projects are rejected.

Retail compatibility remains to be tested with legitimately owned games and assets. See [DAT_EXPLORER.md](DAT_EXPLORER.md) for read-only archive browsing and extraction.
