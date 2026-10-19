# Classic Mod Packager v0.6

An original browser-based **staging utility** for independently authored Fallout 1 and Fallout 2 mod resources. It is not a complete mod builder or installer.

## Create a package
1. Choose target Fallout 1 or Fallout 2 and a package name.
2. Add the saved active Dialogue Studio project (must match target), the current saved Sprite Lab project (FRM plus its matching PAL), or select local .msg, .frm or .pal resources.
3. Inspect validation results, including any duplicate paths, unsupported files or format errors.
4. Export ZIP. The archive includes **manifest.json** (SHA-256 fingerprints, file sizes, origins, target and `installReady:false`) and **README_STAGING.txt** with registration/integration warnings.

## Deliberate archive paths
- `stage/data/text/english/game/<basename>.msg`: candidate dialogue messages.
- `stage/data/art/items/<basename>.frm`: candidate item artwork (not an automatically registered game object).
- `reference/palettes/<basename>.pal`: **reference palette only**, not an automatic game color.pal replacement.
- `manifest.json` and `README_STAGING.txt` live at the ZIP root.

No path from an imported file is trusted: filenames must match a safe single-basename allowlist; traversal, absolute paths, double extensions of unsupported types, case-insensitive collisions, malformed formats and excess-size payloads are rejected. Individual resources max 24 MiB, all staging resources max 32 MiB, total ZIP max 40 MiB and 100 user-resource entries.

## Integration work remains
**This ZIP does not install or register mods.** Fallout 1 and Fallout 2 may need LST, PRO, script and message references and additional game-specific bookkeeping. The resource paths are staging suggestions and must be verified for the user's target build before any game changes. The .PAL is a reference color palette; Fallout palette behavior is not controlled merely by including one in a ZIP.

A user who selects proprietary game data is responsible for the rights to redistribute it. The app bundles no commercial game assets. No original files are modified, and no data is remotely uploaded.

## Technical details
- Uses the original pure TypeScript STORE-only ZIP writer with CRC32, valid local and central directory headers, fixed ZIP timestamps and UTF-8 paths. No compression or third-party ZIP implementation.
- Calculates SHA-256 for every staged resource using Web Crypto; export fails if secure hashing is unavailable.
- Reuses independent existing validators: classic MSG subset parser, FRM version 4 parser, and PAL reader. Unsupported MSG syntax fails rather than dropping lines.
- Does not store arbitrary uploaded binaries in localStorage; staging exists only until the tab/session reloads. This protects browser storage, while allowing explicit downloads.
- Runs synthetic automated tests for staging path safety, duplicate collisions, hash manifest contents, ZIP structure and malformed files. Actual compatibility requires explicit user-owned game testing.

The browser UI is a build/staging environment, not a substitute for a real game-install test.
