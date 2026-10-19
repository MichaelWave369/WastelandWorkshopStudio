# Architecture and safety boundaries

## v0.1: browser workbench

- React + TypeScript + Vite SPA, deployable to GitHub Pages.
- Projects use an explicit `version: 1` JSON schema with separate identifiers.
- Browser localStorage provides best-effort autosave on the current browser only. Use **Export Project JSON** for portable backups.
- The only actual game-specific export today is the intentionally limited single-line `{number}{sound}{text}` Fallout 1 / Fallout 2 `.msg` subset.
- Unsupported imports fail atomically. No dropped lines, no silent conversion.
- Project filename is checked to block directory traversal.
- No filesystem permissions, installed-game access, archive extraction, game executable invocation, network account integration, or game modifications in the web app.

## Future adapters

Keep format-aware implementations independent. FO1 DAT and FO2 DAT are not assumed identical. Fallout Tactics, GECK games, Creation Engine games and Fallout 76 have distinct constraints; no generic promise of interchangeable content. A future Electron desktop app must use explicit user-selected directories, non-destructive reads, provenance labels, size limits, staged writes, rollback, and backup-first installs.

## Intellectual property

This is an independent, unofficial editor. Never distribute game-owned art, scripts, sound, executable files or copyrighted assets in the repo or packaged demo. All starter content is original, and user-imported resources remain local to the browser.

## v0.2 archive inspection

The Classic Vault Explorer accepts a user-selected local DAT archive and parses its index in browser memory without modifying the file. It supports DAT1 plain entries, DAT2 plain/zlib entries, bounded individual extraction, and a synthetic original demo. DAT1 LZSS extraction and rendered sprite/map previews are not implemented. See [DAT_EXPLORER.md](DAT_EXPLORER.md).

## v0.5 Sprite Creation Lab

Original browser-local pixel editor, palette editor, and FRM v4/PAL writer. New project JSON is versioned and validated on import, and autosave remains best effort. Projects have uniform 1–64-pixel dimensions, 1–16 frames shared across 1–6 orientations, indexed pixels, six-bit RGB palette values, and fixed maximum resource sizes. Original assets are never written to source; explicit export creates local copies. See [SPRITE_LAB.md](SPRITE_LAB.md).

## v0.6 Classic Mod Packager

The new Mod Packager bridges browser-local Dialogue Studio and Sprite Lab workspaces, or optional user-selected local .msg/.frm/.pal files. Resources are kept in memory for the current session, validated and exported as a **STAGING-ONLY** ZIP built by an original STORE/CRC32 ZIP writer. Per-file SHA-256 hashes and byte sizes are recorded in manifest.json. Only simple file basenames and fixed vetted stage paths are supported. No writes to game folders, automatic LST/PRO registration, archive repacking or installation. See [CLASSIC_PACKAGER.md](CLASSIC_PACKAGER.md).

## v0.7 Classic Art Registry

This is a local-session, append-only review tool for `art/items/items.lst`. It preserves the user's baseline bytes and zero-based physical line indexes, including empty or comment-only rows, and refuses duplicate proposed names or FID overflow. A selected PRO header can be inspected read-only to compare its FID and PID. Export creates only local proposed LST copies or a review ZIP with SHA-256 before/after receipts. No game files, archives, scripts, prototypes, or registries are modified. See [ART_REGISTRY.md](ART_REGISTRY.md).

## v0.8 Prototype Workshop

The Prototype Workshop reads selected local proto/items/items.lst, art/items/items.lst, optional pro_item.msg, and local item PRO files in memory. It calculates separate one-based prototype PIDs and zero-based art FIDs, inspects all seven known item subtype common headers, and authors only Key/Misc 61/69-byte PRO candidates. The review ZIP carries separate prototype, appended list and message additions under reference/, with SHA-256 receipts. No installed-game modifications, original overwrites, auto-merge, or installation. See PROTOTYPE_WORKSHOP.md.

## v0.9 Handoff
A one-time App-state bridge transfers prototype outputs into the Mod Packager, which checks linked PID/FID/message dependencies, keeps them in reference/ paths, and produces explicit review-only ZIPs. No installed game changes.

## v1.0 Classic Integration Auditor

A pure staged-resource audit engine traces prototype PIDs, item message IDs, art FIDs and sprite files and distinguishes confirmed structural claims, warnings, failed checks and unverified runtime behavior. Mod Packager provides an interactive report and embeds an audited JSON with manifest SHA-256 receipts plus readable notes. Failed staging exports are blocked. No actual installed game, script runtime, or file rights are inferred. See INTEGRATION_AUDITOR.md.
