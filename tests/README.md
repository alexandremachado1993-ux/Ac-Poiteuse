# Automated tests — My Time Keeper

These files are **not** part of the application: they are not loaded by `index.html` and are not cached for offline
use. The application itself has **no dependency**.

## Run all the tests

Requirement: Node.js (18 or later).

```
node tests/run-all.js
```

- Engine, permissions, backups, home work, translations: Node.js is enough.
- Interface (5 accounts, 4 languages) and register suites: need `jsdom`, used **only** by the tests:
  `npm install --prefix tests` (installs the version pinned in `tests/package.json`).
- Register suite: needs the managers' Excel file, which holds personal data and is therefore **not** in the project:
  put it in `tests/data/2026_Registres_Heures_1.xlsx`, or
  `ACP_REGISTER=path/to/2026_Registres_Heures_1.xlsx node tests/run-all.js`
  (without this file the suite is skipped and reported as such).

The launcher prints one line per suite and the total. Exit code 1 on failure.
The tests of the interface check the **French** screens: their expected texts stay in French.

| File | Content |
|---|---|
| `i18n-check.js` | Every key exists in FR/EN/ES/DE with the same variables, no unused key, no French text in the code |
| `logic.js` | Hours and leave engine (2.9.1 countdown method), accounts, sign-in, migrations v1/v2 → v5 |
| `perms.js` | Permissions per profile, sections, temporary rights and expiry, access requests, safeguards, audit trail, notifications, full backup, migration from 2.7 data |
| `backup-security.js` | Personal and full backups: forged files refused, preview, safety copy, audit trail |
| `admins.js` | The two managers manage each other without blocking; restore checked on a copy; audit search |
| `home.js` | Home work (fixed day option, 7 h max, 35 h basis) |
| `corrections.js` | Corrections reserved to the managers, error reports |
| `leave-circuit.js` | Two-step leave circuit (rule `leaveSingleDecision` off) |
| `week-clock.js` | Week validation, undo, night period, urgent call-out, favourites |
| `v3.js` | 3.x: hierarchy, leave rules, register "OK" method and options, replacements, rule notifications; 3.2 layout validation and backups |
| `quick.js` | 3.3: PIN rules, 5 tries, reset by a manager, disabled account; check of the fingerprint / face signature (ECDSA and RSA, tampered cases) |
| `ui.js` | Real journeys in the interface with the five accounts, in the 4 languages; rights really applied; my workspace (drag and drop, widths, persistence, independence between accounts) |
| `register.js` | The managers' register "OK" reproduced week by week |
