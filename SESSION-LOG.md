# Session log

Newest first, about 5 lines each. Older entries (up to 2026-10-06) are in `CLAUDE.md` → Session log.

### 2026-10-20 — Budget, add-a-list import, desktop import script, desktop layout (build `2026-10-20-1`, DESKTOP)

- **Did:** `index.html`: Budget card + sheets (`data.budgets`, per-month merge in `mergeStores`, adopted on push/visibility sync); Settings → Data → "Add a list of entries" (`parseImport`, `markDupes`, undo); two-column layout at ≥1100px (`.colA/.colB` are `display:contents` on phones); global checkbox fix. New `tools/import.js`; `imports/` gitignored. Section 73–74 in `test.js`.
- **Why:** Owner asked to fold the standalone `Random Stuff/budget.html` into the tracker, to send screenshots of spending for Claude to enter so it syncs to the iPhone, and to use the tracker on the desktop. Checkbox bug found while checking the import sheet: `input{-webkit-appearance:none}` hid every tick app-wide.
- **Files:** `index.html`, `test.js`, `tools/import.js`, `.gitignore`, `README.md`, `CLAUDE.md`, `SESSION-LOG.md`
- **Undo:** `git revert` the commit, bump `slip-build`, push. Saved `budgets` / `imp` fields are ignored by older builds.
- **Checked:** `node test.js` 516 passed (456 before). Browser pane at 375px and 1440px, dark and light, invented data; no console errors. Import script dry-run against the real cloud copy (read only), and apply → re-check → undo against a throwaway secret gist of invented data ("Tracker import test - invented data, safe to delete", id `e98315a6…`, left in place). NOT yet checked on the iPhone itself.
