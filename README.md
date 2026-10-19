# Wasteland Workshop Studio ☢️

**The First Vault | v0.3.0 (PR #3)**

An original, unofficial mod-authoring studio for the Fallout series, from the classic isometric games toward later generations.

**Live demo (after Pages deployment):** https://michaelwave369.github.io/WastelandWorkshopStudio/

## What works today

- Retro-inspired React + TypeScript workbench with project selection and game adapter roadmap.
- Read-only **DAT1 (Fallout 1)** and **DAT2 (Fallout 2)** archive explorer, file trees, resource classification and individual export.
- DAT2 uncompressed/zlib and DAT1 uncompressed/LZSS extraction, each bounded to 24 MiB per resource.
- Two original synthetic DAT1 and DAT2 demonstration archives, including a DAT1 LZSS-compressed dialogue file; no bundled game resources.
- Fallout 1 / Fallout 2 **single-line** `.msg` dialogue editing, preview, validation, import and export.
- Project JSON export/import; autosave in this browser's localStorage.
- A self-contained starter project with wholly original demo dialogue.
- Automated parser tests, typecheck, production build and GitHub Pages deployment.

The new explorer is documented in [DAT_EXPLORER.md](docs/DAT_EXPLORER.md).

### Important limits

**This is not a complete Fallout mod compiler or installer yet.** There is no game directory scanning, whole-archive unpacking, sprite editor, quest compiler, or validated in-game mod installation. The `.msg` implementation supports a safe subset; nonmatching lines are rejected in full, not discarded. Mod compatibility in an installed game must be independently checked. Other engine adapters are marked planned or research-only, not silently simulated. Fallout 76 is research-only.

The browser app never scans installed games or modifies a source archive. It reads only files you select explicitly, in your browser; selected game files are not uploaded. All project state stays in your browser except files you explicitly download. LocalStorage is not a backup; download project JSON regularly.

## Develop

Requires Node.js 22+.

```bash
npm install
npm run dev
npm run check
```

The initial CI workflow uses `npm install`; a frozen lockfile and `npm ci` will follow when dependencies are locked for reproducible builds.

## GitHub Pages

The `Pages` workflow verifies PRs and builds/deploys on pushes to `main`. Configure repository Pages source as **GitHub Actions**. Vite is set to use `/WastelandWorkshopStudio/` for Pages production.

## Roadmap

1. Classic `.msg` authoring with portable projects (v0.1).
2. DAT1 / DAT2 read-only file index and bounded extraction (v0.2).
3. DAT1 LZSS decode and synthetic test fixtures (v0.3).
4. Palette-aware FRM sprite preview.
5. Formal game installation discovery in a separate opt-in Electron desktop shell.
6. Separate, tested GECK / Creation Kit tooling, quest graphs and 3D previews.
7. Staged exports and game-specific validation.

See [architecture and safety boundaries](docs/ARCHITECTURE.md).

## License / attribution

Studio code: MIT license. Fallout and related game names belong to their respective owners. Independent fan-made tool, not affiliated with or endorsed by Bethesda, Microsoft, or any rights holder. Do not include copyrighted game assets in distributions.
