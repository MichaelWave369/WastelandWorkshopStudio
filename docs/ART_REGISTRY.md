# Classic Art Registry v0.7

Independent, read-only-aware support for **only** Fallout 1 and Fallout 2 `art/items/items.lst`. This feature is not a general LST editor, mod installer or prototype generator.

## Format and FID semantics

Artwork LSTs use **zero-based physical line indexes**. Even a blank or comment-only line reserves its index. The first token on an art-list line is delimited by a space, comma, semicolon, carriage return, tab or line feed. Documented art-token capacity is **12 characters**, and the low 12 bits of the art FID select indexes 0–4095. Item art type is 0. Our authoring restrictions are tighter: only a simple 8.3 filename with 1–8 safe stem characters and a .frm suffix.

Sources: [fallout2-docs LST/FID format](https://github.com/rotators/fallout2-docs/blob/master/content/pages/lst.md) and [Fallout PRO format](https://jansimek.github.io/fallout2-modding/formats/pro/).

## Workflow

1. In **Art Registry**, load your own local `items.lst` from art/items or select the **original synthetic demo**. Other names, notably scripts.lst or proto/items/items.lst, are intentionally rejected.
2. Inspect baseline physical-line numbers, including reserved rows. Nothing edits or reorders these lines.
3. Add an original, collision-free, 8.3-compliant .frm filename, or obtain a proposed filename from your current saved Sprite Lab project.
4. Review its predicted **art type 0 FID** (e.g., 0x0000002A for index 42) and warnings. Optionally read only the first 12 bytes of a local .PRO to inspect its PID, messageId, and FID and resolve that art reference.
5. Download `items.proposed.lst` as a standalone copy, or a review ZIP with the proposed copy at `reference/registry/items.proposed.lst`, PATCH_NOTES.txt and registry-report.json containing SHA-256 hashes of both baseline and proposal.

For shared work, you may import the resulting proposed .LST into the **Mod Packager**; it stays under the **reference/** namespace, not the installed file tree.

## Guarantees and limits

- Only explicit user-selected files are read. No uploads, installed-file modification, DAT repacking, list replacement, patch application, or prototype/script generation.
- Original LST bytes remain an exact prefix of the proposed copy. New lines append using the baseline line ending. Source/patch hashes make unexpected changes detectable.
- User-selected file must be literally named items.lst, be at most 2 MiB, and use consistent LF or CRLF with no UTF-8 BOM, NUL or unsafe controls.
- Existing baseline oddities are warnings, **not rewritten**. Proposed names are case-insensitive unique against baseline and one another; maximum art index is 4095.
- A newly added art FID does **not** create a usable in-game item. Matching FRM files, prototype associations, list identity, resource precedence, compatibility with a legally owned game, and other modded files remain separate tasks.
- The PRO viewer interprets only the initial 12-byte common header. It does not validate the entire PRO structure or modify it.
- This uses the documented **art item list** format, not the different parsers for critter aliases, talking-head metadata, scripts.lst, or proto lists. Those require dedicated adapters.
- The built-in example uses fully original names, with a comment-only line showing why physical-line counting matters.
