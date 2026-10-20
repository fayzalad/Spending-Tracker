# Session log

Newest first, about 5 lines each. Older entries (up to 2026-10-06) are in `CLAUDE.md` → Session log.

### 2026-10-20 — "Join another device's backup" button (build `2026-10-20-4`)

- **Did:** Added `#joinGist` in Settings → Data: prompts for a gist ID, verifies it opens, confirms with its entry count, sets `rev=0`, pulls, pushes. 5 checks in section 75.
- **Why:** the desktop window had also made its own empty backup (`7fcbb9d7…`, 18:57 UTC, before the blank-ID guard went live) and the app had no way to switch backups.
- **Files:** `index.html`, `test.js`, `README.md`, `CLAUDE.md`
- **Undo:** `git revert`, bump, push.
- **Checked:** 530 tests pass. Stray gists `ab73da3b…` and `7fcbb9d7…` confirmed empty (0 entries, 0 bills); not deleted. Desktop join itself is done by the owner and NOT yet verified.

### 2026-10-20 — Android joined the wrong (new, empty) backup; fixed it and the cause (build `2026-10-20-3`)

- **Did:** Android app (main profile) had created a new empty "Tracker backup" gist (`ab73da3b…`, 18:53 UTC) because the gist-ID prompt was left blank. Repointed it via WebView devtools (set `gistId` to the real one, `rev=0`, reload): it now has 110 entries, 8 bills, the November budget. App: a blank/dismissed ID now asks before creating a backup; Cancel clears the token. `tools/import.js` reads the id from gitignored `imports/gist-id.txt`.
- **Why:** owner reported "merged with your other device but I don't see anything". The prompt's "leave blank to start fresh" path ran with no confirmation.
- **Files:** `index.html`, `test.js` (3 checks), `tools/import.js`, `README.md`, `CLAUDE.md`; local `imports/gist-id.txt`; Android app storage.
- **Undo:** `git revert`, bump, push. The stray empty gist `ab73da3b…` is still on the account (not deleted; owner's call).
- **Checked:** 525 tests pass; real gist still 110 entries / 8 bills / budget after Android synced. A second copy of the app exists in Android user profile 95 (Secure Folder or dual app), unconnected and empty; left alone.

### 2026-10-20 — Safe join for new devices (build `2026-10-20-2`); Android app rebuilt; November budget seeded

- **Did:** `ghTok` change handler sets `data.rev=0` when a device joins an existing gist, so the cloud's settings win (test section 75, proven to fail without the fix). Wrote the owner's November budget (9 lines; amounts only in the cloud copy and gitignored `imports/`) into the cloud copy with `tools/import.js --budget imports/2026-11-budget.json --apply`; cloud `rev` unchanged, 110 entries unchanged. Android wrapper rewritten to load the live Pages site (new working clone `Claude code/Spending tracker (Android)`), built locally, installed over the old app (same debug key, `adb install -r`).
- **Why:** Found while preparing to connect the Android phone and desktop: a fresh device that touched a setting first would have overwritten bills/starts/goal on every device. Android app was 9+ builds behind because it bundled a copy of the page.
- **Files:** `index.html`, `test.js`, `README.md`, `CLAUDE.md`; cloud gist `74315ce4…` (`budgets.2026-11`); Android repo files; phone package `com.fayzal.slip` v2.0.
- **Undo:** code: `git revert`, bump, push. Budget: Clear it in the app, or restore `imports/2026-10-20T18-36-27-before.json`. Android: old data was empty (backup `imports/android-old-localStorage.json`); reinstall the old APK from `Android-Tracker` git history if wanted.
- **Also:** Desktop shortcut `%USERPROFILE%\Desktop\Tracker.lnk` → `msedge.exe --app=https://fayzalad.github.io/Spending-Tracker/`, icon `%LOCALAPPDATA%\Tracker\tracker.ico` (made from `icon-192.png`). Undo: delete both. Tests now use invented budget amounts (public repo); the real ones remain in the history of commits `b80a0d1`/`9a0fafd`. Added `FIGMA-PROMPT.md`.
- **Checked:** 522 tests pass. Android app on the S22 Ultra loaded `2026-10-20-1`, showed the update banner, and after Update runs `2026-10-20-2` (read via WebView devtools). Desktop shortcut opens an Edge window titled "Tracker". NOT yet checked: sync on Android/desktop (needs the owner's token), the iPhone picking up the budget.

### 2026-10-20 — Budget, add-a-list import, desktop import script, desktop layout (build `2026-10-20-1`, DESKTOP)

- **Did:** `index.html`: Budget card + sheets (`data.budgets`, per-month merge in `mergeStores`, adopted on push/visibility sync); Settings → Data → "Add a list of entries" (`parseImport`, `markDupes`, undo); two-column layout at ≥1100px (`.colA/.colB` are `display:contents` on phones); global checkbox fix. New `tools/import.js`; `imports/` gitignored. Section 73–74 in `test.js`.
- **Why:** Owner asked to fold the standalone `Random Stuff/budget.html` into the tracker, to send screenshots of spending for Claude to enter so it syncs to the iPhone, and to use the tracker on the desktop. Checkbox bug found while checking the import sheet: `input{-webkit-appearance:none}` hid every tick app-wide.
- **Files:** `index.html`, `test.js`, `tools/import.js`, `.gitignore`, `README.md`, `CLAUDE.md`, `SESSION-LOG.md`
- **Undo:** `git revert` the commit, bump `slip-build`, push. Saved `budgets` / `imp` fields are ignored by older builds.
- **Checked:** `node test.js` 516 passed (456 before). Browser pane at 375px and 1440px, dark and light, invented data; no console errors. Import script dry-run against the real cloud copy (read only), and apply → re-check → undo against a throwaway secret gist of invented data ("Tracker import test - invented data, safe to delete", id `e98315a6…`, left in place). NOT yet checked on the iPhone itself.
