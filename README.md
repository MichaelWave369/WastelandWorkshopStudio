# Wasteland Workshop Studio ☢️

**The First Vault | v0.1.0**

An original, unofficial mod-authoring studio for the Fallout series, from the classic isometric games toward later generations.

**Live demo (after Pages deployment):** https://michaelwave369.github.io/WastelandWorkshopStudio/

## What works today

- Retro-inspired React + TypeScript workbench with project selection and game adapter roadmap.
- Fallout 1 / Fallout 2 **single-line** `.msg` dialogue editing, preview, validation, import and export.
- Project JSON export/import; autosave in this browser's localStorage.
- A self-contained starter project with wholly original demo dialogue.
- Automated parser tests, typecheck, production build and GitHub Pages deployment.

### Important limits

**This is not a complete Fallout mod compiler or installer yet.** There is no live game directory access, DAT1/DAT2 unpacking, sprite editor, quest compiler, or validated in-game mod installation. The `.msg` implementation supports a safe subset; nonmatching lines are rejected in full, not discarded. Mod compatibility in an installed game must be independently checked. Other engine adapters are marked planned or research-only, not silently simulated. Fallout 76 is research-only.

The web app does **not** read or change installed games. All state stays in your browser except exported files you explicitly download. LocalStorage is not a backup; download project JSON regularly.

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
2. DAT1 / DAT2 read-only inspection and sprite/prototype preview.
3. Formal game installation discovery in a separate opt-in Electron desktop shell.
4. Separate, tested GECK / Creation Kit tooling, quest graphs and 3D previews.
5. Staged exports and game-specific validation.

See [architecture and safety boundaries](docs/ARCHITECTURE.md).

## License / attribution

Studio code: MIT license. Fallout and related game names belong to their respective owners. Independent fan-made tool, not affiliated with or endorsed by Bethesda, Microsoft, or any rights holder. Do not include copyrighted game assets in distributions.
