# Prototype Workshop v0.8

Independent, read-only-aware classic Fallout 1/2 item prototype drafting and inspection tool. Not a mod installer, complete PRO editor, or engine integration system.

## Separate identifiers
- proto/items/items.lst uses **one-based prototype numbers**. The proposed PID is the number of existing physical lines + 1, for item object type 0. Generated filenames are 8-digit decimal numbers with .PRO suffix.
- art/items/items.lst uses **zero-based art indexes** (low 12 bits of the item art FID), and even reserved physical lines count.
- pro_item.msg provides prototype name/description strings. For simple items the proposed name ID is PID × 100 and description PID × 100 + 1. An optional local baseline verifies these IDs are not already used.

## Working
Select separate local proto/items/items.lst and art/items/items.lst, or original synthetic demo baselines. Optionally select pro_item.msg to check message collisions. Existing item .PRO files can be read without modification: common fields for all seven subtypes and additional Key/Misc fields are decoded.
Author original Key (61-byte) or Misc (69-byte) binaries with selected world FID, optional inventory FID, name/description, material, volume, weight, cost and a subtype-specific code/charges. Script ID defaults to -1. No engine flags are invented.
Export a standalone PRO or a review ZIP. ZIP contents: reference/proto/items/XXXXXXXX.PRO, reference/proto/items/items.proposed.lst, reference/messages/pro_item.additions.msg, prototype-report.json and REVIEW_NOT_INSTALL.txt. Its manifest includes original and proposed SHA-256 receipts and installReady:false.

## Explicit limitations
- No game-file modifications, auto merging, installation, DAT repacking or insertion of existing list rows.
- The proto LST original is retained as an exact byte prefix. Only an append row is created, with the source line ending.
- Unsupported subtypes (armor, container, drug, weapon, ammo) are inspection-only. No authoring yet.
- Synthetic roundtrips show structural consistency with our parser, not guaranteed retail-game compatibility. Real asset registration, scripts, prototype list precedence, flags, inventory art and game behavior still require testing.
- The game selector labels the intended target; it does not magically make a prototype runtime-compatible.
- Limits: prototype number 100,000, proto list 2 MiB, PRO inspector 1 MiB, pro_item.msg 2 MiB. Fail closed on unsupported syntax, duplicate message IDs and message collisions.
- Saved-game compressed prototypes are not handled.

## Sources
- https://jansimek.github.io/fallout2-modding/formats/pro/
- https://falloutmods.fandom.com/wiki/PRO_File_Format
- https://github.com/alexbatalov/fallout2-ce/blob/main/src/proto.cc

No third-party code or commercial game assets copied.
