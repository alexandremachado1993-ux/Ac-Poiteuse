# My Time Keeper (formerly AC Conger Payer + pointage) — version 4.7.1

Clocking, timesheets, leave and absences for itinerant service technicians (SAT France, Auxiliar Conservera).
**Local** application: HTML / CSS / JavaScript, **no library**, **no server**, works offline.
Interface in **French, English, Spanish and German**. Source code, comments and documentation in English.

> History of the versions, decisions and open points: `CHANGELOG.md`.

## Run the app on a computer (nothing to install)

1. Unzip the archive into a folder.
2. **Double-click `index.html`**, or open it in **Chrome** or **Edge** (checked in Chromium).
3. Choose your name, then your password at the first sign-in (6 characters minimum).

The data stays **in this browser, on this computer**. Changing browser or clearing the browsing data loses access to
the data: **export a full backup regularly** (Settings → Backup, with a manager account).

Optional — installation as an app (PWA, full offline mode, phone): serve the folder with a web server (for example the
"Live Server" extension of VS Code, or any static hosting), then open `http://…/index.html`.

## Updating from a previous version

Open the new version **in the same browser, at the same location**: the data is converted automatically, with a
verified safety copy; the old data is never rewritten. When in doubt: export a full backup **before** updating.
On every deployment, increase `CACHE_VERSION` in `sw.js` (`acp-v54` → `acp-v55`…), otherwise the devices keep the old
files.

## Reference accounts

| Account | Job title | Role | Sections | Clocking |
|---|---|---|---|---|
| Alexandre Machado | Technicien | technician | Sud | mandatory |
| Damien Morvan | Technicien | technician | Nord | mandatory |
| Enrique Soler | Chef d'équipe | team lead | Nord + Sud | no (can be turned on) |
| Yann Lefloc'h | Responsable Qualité | quality manager | all | no (can be turned on) |
| Jérémie Augé | Responsable Commercial France & PDG | director | all | no (can be turned on) |

Job titles and section names are company data, kept in French. An "IT department" account can be created by a
manager (accounts, rights and backups, no access to hours or leave).
Menus and tabs depend on the **permissions**; the rights are also checked again in the business logic. Details of
the permissions and of their limit (local check ≠ server check): `ARCHITECTURE.md`.

## Features

- Clocking: arrival, break / resume, departure; activities **Work, Home, Meeting, Travel, Meal**; client and note;
  "Undo" for 10 s; countdown before the night period (21:00); urgent call-out during leave.
- Timesheet: week / month, day "clocked − meal = day", summary, counters, value of the week like the managers'
  register, exports (Excel, PDF, HTML, CSV). **Corrections and imports reserved to the managers** (Team → file);
  technicians **report an error**.
- Week validation: the technician sends, the team lead validates, quality or director locks; replacements when a
  manager is away; unlock request.
- Leave & absences: shared calendar (month, week, year), the first decision among team lead / quality / director is
  final, notice periods, half days, cancellation, carry-over, absence types, balances (25 days a year, counted Monday →
  Friday, May → May).
- Dashboards per profile (technician, team lead, quality manager, director).
- Team, reports (per employee or several, export Excel and PDF, "to pay" column).
- Settings: time rules (all editable by the quality manager, each change announced to the technicians), clients,
  sections, rights and access requests, audit trail, backups (personal / full with preview and strict validation),
  reference document, **my workspace** (theme, menu on the left or on the right, start page, tab order and visibility,
  dashboard blocks and widgets moved / hidden / resized by drag and drop — saved for each person), my preferences
  (reminders, absence for replacements).
- Internal notifications (bell), clickable to the page concerned.
- First sign-in presentation; accesses of the app (notifications, protected data, installation); quick sign-in on
  the device by 4-digit PIN or fingerprint / face (https).

**Not available**: synchronisation between devices (needs a server), e-mail / SMS, payroll.

## Documents

| File | Content |
|---|---|
| `CHANGELOG.md` | Versions, decisions, open points |
| `ARCHITECTURE.md` | Organisation, profiles, permissions, data model, rules, storage and quotas, migrations, future platform, what stays in French |
| `MANUAL_TESTS.md` | Scenarios to run in the interface with the five accounts |
| `tests/README.md` | Automated tests: `node tests/run-all.js` |

Design 4.0 "Corporate Dark + Soft Premium" (navy, burgundy, light work areas). Icons: Lucide (ISC License,
`LICENSE-lucide.txt`). Fonts: Inter / Inter Tight (SIL OFL).

`netlify.toml` and `robots.txt` are only used if the folder is published on a static hosting; the app depends on no
service.
