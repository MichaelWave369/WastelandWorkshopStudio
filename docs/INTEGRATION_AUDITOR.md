# Classic Integration Auditor v1.0

Audits only **staged browser-local resources** for Fallout 1/2. This is a deterministic, read-only inspection of selected files and their apparent structural relationships. **No installed game or game engine is checked, and no source file is changed.**

## In the Mod Packager
The new **CLASSIC INTEGRATION AUDITOR** panel runs whenever you change staged resources, target, or package name. Its four check types are:

- `pass`: a specific claim can be supported by the currently staged byte streams (e.g., PID matches one-based list row).
- `warning`: a potential dependency is unresolved (e.g., referenced FRM is absent from staging but *may* exist in a local installed game).
- `fail`: a definite conflict in staged bytes or the packaging contract. Export is blocked.
- `not-checked`: information is not available to this stage (installed game assets, runtime script registration, ownership rights, real-game behavior).

The resulting status is either **BLOCKED** or **CONSISTENT FOR REVIEW**. It can NEVER be "installation ready" or "runtime verified" in this version.

## Item dependency graph
For every Key/Misc item PRO, follow:
1. The PRO filename and header PID to its one-based entry in the staged prototype LST.
2. The header message ID and the next ID to entries in the staged pro_item message additions.
3. Its type-0 art FID to a physical, zero-based art items LST line (including counting blank/comment rows).
4. The resolved filename to an optional staged FRM and associated reference PAL.

A staged match **does not** prove successful engine registration. A missing staged FRM is a caution, NOT proof that the installed game lacks the sprite. A missing prototype list, message entry, malformed PID or unresolved art entry is a blocking error.

Standalone FRM resources are identified as untraced without a staged PRO. Standalone dialogue MSG files have syntax checks but cannot be connected to scripts without additional game files.

## Reports and receipts
The packager allows downloading `<name>-<target>-preflight.json` even if structural checks are blocked. A blocked audit has `receipts: null` and cannot be exported as a full staging ZIP.

For structurally consistent packages, ZIP export adds:
- `audit-report.json` with item traces, checks, structural status, **SHA-256** receipts from the exact same staged manifest, and manual tasks.
- `AUDIT_NOT_INSTALL.txt` containing a readable version of those findings.
- Existing `manifest.json` and `README_STAGING.txt` remain.

Receipt hashes cover staged resource bytes. The audit report and notes themselves are not listed as user source resources in the manifest. This avoids circular or misleading claims about their provenance.

## What still needs manual verification
- Installed game file availability and resource load precedence.
- Prototype, art and dialogue registrations in an actual Fallout installation.
- Real engine features such as scripts, animation, palette effects, inventory-art behavior and flags.
- Whether a patched list is compatible with other installed mods.
- Actual in-game behavior and tests using a legally owned, separately backed-up install.
- Rights to redistribute any selected proprietary files.

No automatic LST application, game installation, DAT repacking, external uploads or rights assumptions occur. The audit never substitutes structural fixture tests for retail-game validation.
