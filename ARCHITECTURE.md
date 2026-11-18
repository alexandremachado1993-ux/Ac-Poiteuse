# ARCHITECTURE — My Time Keeper (4.7.1)

## 1. Principle

Local web application, with no server and no library: HTML, CSS and JavaScript, data in the browser. It works
offline. No platform has been chosen yet: the code separates the layers so that a future remote storage or API
replaces **a single file** without rewriting the screens.

```
Screens (page-*.js, ui.js, app.js)
      │  read and write only through Store, check rights through Permissions
Business logic (hours.js, segments.js, leave.js, holidays.js, countdown.js)
      │
Permissions (permissions.js)  ◄── also consulted by store.js for every sensitive write
      │
Data access (store.js): schema, migrations, rights checks, audit trail, notifications, backups
      │
Storage (storage-adapter.js): the ONLY file touching localStorage / sessionStorage
```

## 2. Files

| Layer | Files |
|---|---|
| Storage | `storage-adapter.js` |
| Data | `store.js` |
| Rights | `permissions.js`, `auth.js` (sign-in, session), `quick-unlock.js` (PIN code, fingerprint / face on this device) |
| Validation | `validation.js` (strict validation of imported files and personal settings; pure functions) |
| Business | `hours.js` (week, goal, credits, overtime, register "OK" method, home work), `segments.js` (entries → hours, night, home work cap), `leave.js` (leave balance, days counted), `holidays.js` (French public holidays), `countdown.js` |
| Imports / exports | `hours-csv.js`, `exports.js`, `xlsx.js`, `xlsx-reader.js`, `register-import.js` |
| Screens | `page-login.js`, `page-dashboard.js`, `page-clock.js`, `page-weeks.js` (week and leave validation), `page-timesheet.js`, `page-leave.js`, `page-team.js`, `page-clockings.js` (the team's clocking day by day, drawn in Team → Clockings since 4.7), `page-reports.js`, `page-settings.js`, `page-profile.js`, `page-clients.js`, `page-admin-panels.js`, `editor.js`, `reminders.js`, `ui.js`, `layout.js` (personal arrangement of the workspace, drag and drop), `welcome.js` (first sign-in presentation, accesses of the app) |
| Start-up | `app.js`, `index.html`, `sw.js` (offline mode), `manifest.json` |
| Languages | `i18n.js`, `translations.js` (FR, EN, ES, DE) |

## 3. Profiles and permissions

Three dimensions: (1) the hierarchical **role** gives the default rights; (2) the **perimeter** (sections,
`allSections`, hierarchical level) limits the people visible; (3) **individual rights** complete them, permanently or
temporarily. Account status and clocking obligation are separate fields. No rule names a person.

Table generated from `js/permissions.js` (4.5.0 — since 4.1.6 the director has the same rights as the quality manager):

| Permission | Technician | Team lead | Quality manager | Director (CEO) | IT department |
|---|:-:|:-:|:-:|:-:|:-:|
| `timeclock.self` | ✔ |   |   |   |   |
| `timeclock.team.view` |   | ✔ | ✔ | ✔ |   |
| `timeclock.global.view` |   |   | ✔ | ✔ |   |
| `timeclock.report_issue` | ✔ | ✔ |   |   |   |
| `timeclock.correction.request` |   | ✔ | ✔ | ✔ |   |
| `timeclock.correction.approve` |   |   | ✔ | ✔ |   |
| `timeclock.correction.audit` |   |   | ✔ | ✔ |   |
| `leave.self.request` | ✔ |   |   |   |   |
| `leave.self.view` | ✔ |   |   |   |   |
| `leave.team.view` |   | ✔ | ✔ | ✔ |   |
| `leave.team.review` |   | ✔ |   |   |   |
| `leave.global.view` |   |   | ✔ | ✔ |   |
| `leave.global.approve` |   |   | ✔ | ✔ |   |
| `leave.global.audit` |   |   | ✔ | ✔ |   |
| `leave.balance.manage` |   |   | ✔ | ✔ |   |
| `employees.team.view` |   | ✔ | ✔ | ✔ |   |
| `employees.global.view` |   |   | ✔ | ✔ |   |
| `employees.manage` |   |   | ✔ | ✔ | ✔ |
| `reports.self.view` | ✔ | ✔ | ✔ | ✔ |   |
| `reports.team.view` |   | ✔ | ✔ | ✔ |   |
| `reports.global.view` |   |   | ✔ | ✔ |   |
| `reports.export` |   |   | ✔ | ✔ |   |
| `settings.view` |   |   | ✔ | ✔ | ✔ |
| `settings.manage` |   |   | ✔ | ✔ |   |
| `permissions.request` |   | ✔ | ✔ | ✔ |   |
| `permissions.manage` |   |   | ✔ | ✔ | ✔ |
| `backups.manage` |   |   | ✔ | ✔ | ✔ |
| `audit.view` |   |   | ✔ | ✔ |   |
| `absence.sensitive.view` |   |   | ✔ | ✔ |   |
| `timesheet.week.review` |   | ✔ |   |   |   |
| `timesheet.week.lock` |   |   | ✔ | ✔ |   |
| `password.team.reset` |   | ✔ |   |   |   |
| `leave.team.approve` |   | ✔ |   |   |   |

- Quality manager: control, compliance, corrections, rules, backups. Director: steering, global view, decisions;
  consults the rules and the corrections. Both manage accounts and rights, decide leave (either one is enough), export
  the summaries. Each can **ask** the other for a missing right; nobody grants a right to himself.
- Team lead: sees his technicians, validates their weeks first, decides their leave when the rule
  `leaveSingleDecision` is on (default), requests no leave for himself.
- IT department: accounts, rights and backups; sees nobody's hours or leave, and nobody sees it in the teams.
- **No `payroll.*` permissions**: the app does not do payroll (decision of 06/11/2026); the hours summary sent to
  accounting relies on `reports.export`.
- **Hierarchical perimeter** (`Permissions.LEVEL`): technician 0, team lead 1, quality / director 2, IT −1.
  `canSeeUser` always refuses upwards; same level only for the managers. Then the sections: a team permission needs a
  shared section; a global permission only works with "all sections".
- Names used up to beta.4: `Permissions.RENAMED` (rights and requests converted by the v5 migration).
- **Individual rights** (`grants`): permanent or temporary (start, end), revocable. A temporary right is compared with
  today's date **at every check**: it expires even if the app stayed closed.
- **Safeguards** in `store.js`: no self-granted right, no self-approval, no self-disabling nor self-demotion, never
  zero active administrator.
- **Actor and subject**: `current` = who acts (rights, author in the audit trail); `withUser(id, fn)` gives access to
  another account's **data** without changing the actor (consultation, correction, import by a manager).
- **Entries**: live clocking creates and closes its own activities; any manual addition, import, traced change or
  deletion of a finished entry needs `timeclock.correction.approve` (mandatory reason, `correctDay`). A new request
  is always "pending"; approved history and shared clients are reserved to the managers.

⚠️ **Security limit**: the app being local, these checks run in the browser. They organise access but **are not
equivalent to server-side checks**: someone with access to the device and the browser tools could bypass them, and the
passwords do not really protect the data stored on the device. Real security comes with a server.

## 4. Data model (key `acp_data_v5`)

```
{ version: 5, deviceId,
  org:      team rules (39 h, 35 h + 4 h at 25 %, credited day 7.8 h, register "OK" method, night, holiday,
            home work, leave 25 ÷ 12 days a month Monday → Friday, notice periods… — DEFAULT_ORG in store.js),
  sections: [ { id, name } ],
  users:    [ { id, name, jobTitle, hireDate, entity, role, language, pinHash,
                accountStatus, sectionIds, allSections, clockRequired, awayFrom, awayTo } ],
  clients:  [ { id, name, city, lines, createdAt } ],               — shared by every account
  perUser:  { [userId]: { settings, entries[], requests[], lastBackupAt } },
  grants, accessRequests, correctionRequests, leaveMovements, audit, notifications, weekValidations }
```

Session: `sessionStorage` `acp_session`. Language: `localStorage` `acp_language`.

## 5. Business rules (state 3.1)

- Week Monday → Sunday. Fixed goal **39 h** (35 normal hours + 4 habitual hours at +25 %), monthly reference **169 h**
  (39 × 52 ÷ 12), never varying with the month.
- **Register "OK" method** (default, `hoursMethod: "register"`): credited day 7.8 h (39 ÷ 5) Monday → Friday; every
  hour above the goal valued × 1.25 (night 25 % and holiday 50 % premiums added first); a week under the goal = 0;
  weeks 22 → 39: valued hours **paid**, the rest banked as time off; Sunday + 100 % in a separate counter; urgent work
  during leave paid + 50 %. The 2.9.1 countdown method stays available (`hoursMethod: "countdown"`).
- Clocking categories: Work, Home, Meeting, Travel, Meal (+ Break through its own button). **Home** is a timer like the
  others; with `homeDayPreset` it becomes the fixed day (7 h + meal); 7 h maximum counted per home day, goal −0 h 48
  per home day (rules `homeWorkHours`, `homeReducesHabitual`).
- **Leave**: 25 ÷ 12 days per full month, period May → May, counted Monday → Friday (`leaveDayMode: "monFri"`;
  option `"monSat"` with 2.5 days a month), public holidays excluded, half days, notice periods, carry-over on request.

### Leave circuit

```
draft ──send──► waiting for the final decision ──► approved / refused   (first decider: team lead,
                                                                         quality OR director — rule 10.1)
cancelled: by the requester before the decision; an approved leave: cancellation asked, then decided
```
With `leaveSingleDecision: false`, the 2.8 two-step circuit returns (team lead's opinion, then final decision by
quality or director). Rules in `store.js` (`addRequest`, `submitRequest`, `reviewRequest`, `decideRequest`,
`cancelRequest`, `requestCancellation`, `decideCancellation`); screens: `page-leave.js`, `page-weeks.js`.

## 6. Local storage and quotas

- The browser grants about **5 MB** of `localStorage` per site (varies with the browser, no guarantee).
- Settings → Backup shows the space used and warns above 80 %.
- Safety copies (before migration, before restore, old v1/v2/v3 keys) use space: delete them only **after** exporting
  a full backup.
- Opened by double-click (`file://`) in Chrome or Edge, the storage belongs to that browser and that computer.
  Changing browser or clearing the browsing data loses access to the data: **export a full backup regularly**.
- When writing is impossible (storage full), a message asks to export, then delete old copies.

## 7. Migrations

On the first start of a new version: (1) copy of the old data under `acp_backup_before_v5_<date>`, (2) copy read back
and compared, (3) migration to the new key (the old key stays intact), (4) integrity check, (5) report written to the
audit trail. v3 → v4 applies the reference organisation (roles, sections, mandatory clocking, job titles) and traces
every changed account. v4 → v5 splits the old "administrator" role into "quality manager" and "director" and renames
the permissions of individual rights and access requests. Team rules carry `rulesVersion`: version 30 (3.0) moves the
old defaults to the register "OK" values, version 31 (3.1) the leave counting; a value set by a manager is kept.

## 8. Backups and data integrity (batch 1, beta.6)

| | **Personal** backup | **Full** backup |
|---|---|---|
| Who | Every account, for its own data | Right `backups.manage` (quality manager, IT) |
| Content | Hours, requests, clients and settings **of the account** (copy to keep) | All data: accounts, sections, entries, requests, rights, rules, audit trail |
| Restore | **Personal settings only** (reminder, vibration, notifications, display) | Full replacement, after validation and preview |
| Business data | **Never** rewritten: entries, leave, balances, clients of the file are counted then ignored | Replaced, only if the file is valid |
| Right | Signed-in account (the restore never targets another account, even through `withUser`) | `backups.manage`, **checked in `store.js`**, not only on screen |

Chain of a full restore: right → reading and version → **strict validation** (`validation.js`) → checksum and
manifest → **preview** without writing (`Store.previewRestore`: current / file / after counters, accounts that would
appear or disappear, roles, team rules, approved leave) → confirmation → **safety copy read back and compared** →
replacement → audit event (author, copy, result). Every refusal is logged (`backup.restoreRefused`: who, scope, reason)
and changes no data.

**Strict validation** (`js/validation.js`, pure functions): structure and types; non-empty unique identifiers; known
role, account status, sections; request type and status in the list; real and consistent dates; a decision (approved /
refused) needs its decider and date, except history imported from the register (`imported`); known entry categories,
end ≥ start; individual rights: known permission, temporary right with an end; references (rights, requests) to
existing accounts; team rules of the same type as their default; at least one active administrator. **Errors** refuse
the file; **warnings** (orphan data, unknown setting, no manifest for a file older than 2.8) are shown in the preview.

Personal settings: closed list with the type of each setting; old removed settings (2.2 / 2.4) are ignored without an
error; any other key or wrong value refuses the file. Safety copy of the settings before each personal restore (the
last five are kept).

The full backup contains the password hashes for a future migration: keep it in a safe place. The checksum detects a
damaged or wrongly modified file; it is not a signature: someone who recomputes the checksum and deletes the manifest
is stopped by the structure validation, but not consistent data forged by a person allowed to restore.

⚠️ **Limit**: these checks protect against a mistake or a booby-trapped file given to the app. They do not protect
against someone who controls the browser or the files of the computer (see section 3).

## 9. Version 2.9.0 (10/11/2026): design overhaul and new rules

- **Design**: `css/style.css` rewritten (dark menu, "hero" blocks, rings, sparklines, bars per activity, fixed icon and
  colour per activity). Inter and Inter Tight fonts **embedded** in `/fonts` (SIL OFL licence, licence files included):
  identical offline. Shared components in `ui.js` (`ring`, `spark`, `weekBars`, `activityIcon`, `avatarStatus`, `pill`,
  `toast`).
- **Screen sizes**: ≥ 900 px side menu; < 900 px top bar + bottom tabs. Wide tables scroll, sheets at the bottom of the
  screen on phones. Dark mode: the device theme, or forced by the person (3.1, `UI.applyTheme`; 4.2: `<html data-theme>`).
- **Dashboards per profile** (`page-dashboard.js`), chosen from the RIGHTS: person who clocks; team lead (live team,
  to handle, next week); quality manager (validation queue, compliance, backup); director (`reports.export`: 12 months,
  decisions, sections, export). Compliance thresholds in `LIMITS` (confirmed on 10/11/2026, warnings only).
- **Clocking** (`store.js`: `startClock`, `stopClock`, `undoClock`, `nightPending`, `confirmNight`, `nightCheck`):
  rules applied in the logic, not only on screen. Undo during `undoSeconds` (10 s, in memory only). Night period:
  activity started before `nightStart` → 10 s countdown; no answer = departure clocked at `nightStart` exactly, marked
  "to check", managers told (also when the app is opened again: `Reminders.check`). Favourite clients in the personal
  settings (`favoriteClients`).
- **Urgent work during leave / time off** (decision of 10/11/2026): clocking allowed only as an urgent call-out
  (confirmation, `entry.urgent`, notification, audit trail). The day **stays credited and counted**; the hours worked
  that day are paid with the `absenceWorkedRate` premium (50 %).
- **Week validation** (`weekValidations`, statuses `sent` → `pending_lock` → `locked`, or `returned`): the technician
  reviews and sends; the team lead validates first; quality OR director locks (the first is enough). Without a team
  lead covering the person: straight to the lock. Every step keeps who / when / comment. Rule `weekClosureRequired`:
  the previous worked week must be sent before clocking. A locked week: corrections and deletions refused
  (`weekLocked`) until it is reopened (returned with a comment).
- **Home-screen shortcuts** (`manifest.json`): Start · Work, Break, Departure, Timesheet. A real widget is not possible
  for a web app on Android / iPhone.
- **Limit**: without a server, alerts (night, forgotten departure) only show while the app is open; the "no answer"
  rule applies when it is opened again.

## 9 bis. Version 3.0.0 (10/11/2026)

- **Hierarchical perimeter** (`permissions.js`, `LEVEL`): see section 3.
- **Leave** (`store.js`): `canDecideLeave` (right `leave.global.approve`, or `leave.team.approve` + rule
  `leaveSingleDecision`), `decidersOf`, `noticeOf`, `overlapsOf`, flags `lateNotice` / `overlap` / `overBalance` set when
  sent; `requestCancellation` / `decideCancellation`; `requestCarryOver` / `carryOver` (collection `leaveMovements`,
  period `Leave.periodStart`). Requests on behalf of a technician: managers only.
- **Managers' absence**: account fields `awayFrom` / `awayTo`, `isAway`, `setAway`; used by `sendWeek`, `reviewWeek`,
  `lockWeek` and `decidersOf`. `requestUnlock` for the team lead.
- **Hours** (`hours.js`): `weekSummary(...).register` = { cumul, goal, extra, valued, paid, premiumsIn, premiumsAfter,
  absencePay, sundayPremium }; `recoveryBalance()` returns `method`, `valued`, `toPay`, `sundayPremium`. Rules in
  `DEFAULT_ORG` (`hoursMethod`, `overtimeRecoveryRate`, `overtime50InRecovery`, `negativeWeeks`, `timeOffReducesGoal`,
  `leaveReducesGoal`, `premiumsBeforeOvertime`, `paidOvertimeFromWeek/ToWeek`, `sundayRate`, `creditWeekdaysOnly`).
- **Rule change**: `updateOrg` notifies the technicians (`rules.changed`, before → after).
- **3.1**: personal display settings (`theme`, `menuSide`, `navOrder`, `navHidden`, `startPage`), `homeDayPreset`,
  `leaveDayMode`, `Leave.countsOn` (one rule for counting and drawing leave days), `UI.personColor` / `UI.who`.
- **3.2 — my workspace** (display only, see § 9 ter).
- **Tests**: `tests/v3.js` and `tests/register.js` (register "OK" week by week; personal file not delivered: put it in
  `tests/data/` or set `ACP_REGISTER`).

## 9 ter. Version 3.2.0: personal workspace

- **Where it is stored**: in the person's own settings, `perUser[id].settings`, through `Store.updateSettings` (no new
  storage key, no server). Keys: `theme`, `menuSide` (`left` / `right`; bottom bar on phone and tablet as before),
  `startPage`, `navOrder`, `navHidden` (3.1) and **`dashLayout`** (3.2):
  `{ <view>: { order: [block ids], hidden: [block ids], sizes: { <block id>: 3 | 4 | 6 | 8 | 12 } } }`, one entry per
  dashboard view (`me` = person who clocks, `lead`, `quality`, `director`). Validated by `Validation.settings`
  (`SETTINGS_RULES.dashLayout`): personal and full backups keep working; data from 3.1 gets `{}` (original layout).
- **`layout.js`**: `arrange()` applies the saved order / visibility / widths to the blocks a page built, ignoring unknown
  ids and widths not allowed for the block; a block missing from the saved order (new block) is placed after its
  default neighbour. `grid()` draws a 12-column grid (`.dash-grid`, `.dash-item.wN`); widths are for a computer:
  ≤ 1100 px, 1/4 → 1/2 and 1/3, 2/3 → full width; ≤ 640 px everything full width (same breakpoints as the former
  grids). `sortable()`: drag and drop with the pointer events (mouse, pen, touch; handle `[data-drag]` with
  `touch-action: none`) and the keyboard (arrows on the handle). `isDragging()` stops a redraw during a drag.
- **Blocks and widgets**: `page-dashboard.js` describes each block `{ id, label, kind, size, sizes, html }`
  (`widget` = KPI tile, `block` = card / banner). Blocks are still built from the **permissions**: hiding one never
  gives nor removes a right, and never changes data. To add a widget later: one more entry in the list, with its
  default width and the widths its content accepts — nothing else to change.
- **Screens**: Settings → **My workspace** (`workspace` tab, every account): general layout (theme, menu side,
  start page), menu tabs (drag and drop, up / down buttons, show / hide, default order), dashboard blocks and
  widgets (drag and drop, show / hide, width), reset of the dashboard and of the whole presentation. On the dashboard,
  **Customise** opens the same arrangement in place (handle, − / +, eye). The **Preferences** tab keeps the reminders
  (people who clock) and the absence for the replacements (managers); it is shown only to those accounts.
- **Limit**: the director's "Sections" and "Accounting export" cards stay one block (they share one column).

## 9 quater. Version 3.3.0: presentation, accesses, quick sign-in

- **Presentation** (`welcome.js`): 7 steps, the same for everybody, at the first sign-in of each account (setting
  `introDone`, validated like the other settings); skippable; seen again from Settings → Preferences.
- **Accesses**, asked only when the person taps: notifications (accounts that clock — they only serve the forgotten
  clocking reminder), protected storage (`navigator.storage.persist`), installation (`beforeinstallprompt`; Safari:
  instructions). Each one says when the browser or the address does not allow it (`file://` = double-click).
- **Quick sign-in** (`quick-unlock.js`), per account and **per device**, key `acp_quick_unlock` (not in
  `acp_data_v5`, not in the backups): 4-digit PIN (SHA-256 of account + PIN; 4 identical digits and straight
  sequences refused; 5 wrong codes remove it); fingerprint / face with WebAuthn (platform authenticator, user
  verification required; the public key is kept and the signature, challenge, origin and "user verified" flag are
  checked in the app). The current password is asked to set either; a password reset by a manager
  (`Auth.resetPassword`) or a disabled account removes / blocks both. Audit action `session.quickChanged`.
- **Limit**: like the password, a lock of the screen of the device, not a protection of the data (no server);
  a 4-digit PIN has 10 000 combinations, hence the 5-try limit. Fingerprint needs https (IIS, Netlify) or localhost.

## 9 quinquies. Version 4.0.0: "Corporate Dark + Soft Premium" design

- **Presentation only**: no business file changed (hours, segments, leave, store rules, permissions, auth, validation
  of data); same pages, menus, tabs, routes, ids, classes and events.
- **Design system** at the top of `css/style.css`: charter variables `--color-navy`, `--color-burgundy`,
  `--color-background`, `--color-surface`, `--color-success`, `--color-warning`, `--color-danger`, `--color-text`,
  `--color-muted`, `--color-border`; the working tokens of 2.9 (`--brand`, `--bg`, `--surface`, `--side`, `--hero`…)
  now point to them, so every screen follows. Dark theme (Settings → My workspace) keeps a navy structure.
  Component layer "4.0" at the end of the file (menu, cards, buttons, fields, tables, badges, dialogs, sign-in).
- **Icons**: Lucide (ISC, `LICENSE-lucide.txt`), copied as SVG paths in `UI.icon` (same names; no library, offline).
- **Logos**: `images/logo.png` (Auxiliar Conservera) and `images/app-icon.svg` (My Time Keeper) unchanged; the
  Auxiliar logo is now also shown in the side menu (`.side-company`).
- **4.0.1**: computer header `.deskbar` (`#notifButton`, user menu
  `#userMenuButton` / `#userPop` holding `#sideUser`, "My profile" and `#signOutButton` — same ids as 3.x); the side menu
  keeps the pages, the Auxiliar logo and the language. Denser layer "4.0.1" at the end of `style.css` (smaller tabs
  and controls with a mouse — touch keeps 44 px —, the month calendar sized to the window height).
- **4.1.0 — proportions**: one layer "4.1" at the end of `style.css` replaces the size layers of 4.0.1 → 4.0.3.
  Spacing tokens `--s-1` … `--s-10` (4, 8, 12, 16, 20, 24, 32, 40 px); type tokens `--fs-caption` 12, `--fs-small` 13,
  `--fs-body` 15, `--fs-sub` 16, `--fs-section` 18, `--fs-page` 24 → 30, `--fs-figure` 22 → 26, `--fs-display` 36 → 48 px
  (fluid with `clamp()`); controls `--control` 40 px with a mouse, 44 px on touch screens; container `--container`
  1 320 px. No `transform: scale()` to enlarge anything (only the short press feedback).
- **4.1.1**: managers' dashboards — filter "Team shown" (`#dbScope`: whole team, a section of the perimeter, one
  technician; display only, kept for the session) applied to every block of the team view; the people counted are
  named under the filter and in the director's banner. Clock page sized down (live card, "My week").
- **4.1.2**: Settings zone classes `st-columns` (Profile, My workspace, Preferences, Backup: cards on two CSS columns,
  one below 1 100 px) and `st-full` (rules, clients, sections, rights, audit, reference). Sign-in on-screen keyboard
  (`keypadHtml` / `wireKeypad` in `page-login.js`; 4.3.1: digit pad of the mock-up — 1 to 9, a wide 0, erase — full
  width, same for the password and the PIN; letters are typed with the device keyboard; password fields have an eye
  button to show / hide what is typed, `UI.passwordField` + one document listener on `[data-pw-eye]`); keys out of the Tab order, the field keeps the focus, an `input` event is sent (PIN sent at the 4th
  digit as before).
- **4.1.3 → 4.1.7**: no breadcrumb (page frame in 3 zones: title + bell / profile, commands, content); Leave: "+" at the
  end of the tab line; month calendar sized to the window (`:has()`), the page scrolls only when needed; director = same
  rights as the quality manager (dashboard view chosen by the ROLE); Time rules locked until **Edit**, saved all at once
  by **Validate** (one audit line per rule, rule names shown in the audit trail, one notice to the technicians);
  Sections: edit (name + people) and delete when nobody is attached (`Store.removeSection`, audit `section.removed`);
  **hire date**: `Hours.weekCredits` gives nothing before it and `weekSummary` lowers the goal by `dayHours` per day not
  yet employed (prorata), so reports, dashboards and timesheets start at the hire date.
- **4.1.8**: link to the metal-industry collective agreement (`CCN_URL`, `explanations.js`) on the reference document.
- **4.2.0 — clean-up** (no change of business rule): `style.css` without overridden declarations (same selector +
  property declared again later) nor unused classes, rules of the same selector merged — checked by comparing the
  computed style of every element (light and dark) before / after; dark rules scoped to `:where([data-theme="dark"])`
  (same specificity as before), so the theme choice also works when `index.html` is opened by double-click (the
  browser refuses to let a `file://` page rewrite its stylesheet). Shared helpers instead of copies: `Utils.days`,
  `Utils.printHtml` (one invisible print frame), `UI.PERSON_STATES` / `UI.personState`, `UI.nameOf`,
  `UI.passwordField` (no numeric keyboard on phones: passwords may contain letters), `Store` `periodOf` /
  `notifyAccessManagers`, one `MANAGER` rights list for quality and director. Removed (never called): `Store.sync`,
  `Store.pendingSync`, `Hours.weekBase`, `Auth.isAdmin`, `Layout.WIDTHS`, `UI.hideToast`. Reference document: credited
  day = weekly base ÷ working days (39 h ÷ 5, Monday → Friday), computed from the rules.
- **4.3.0 — forgotten password**: link on the password and PIN screens → `renderForgot` (`page-login.js`).
  (1) `Store.askPasswordUnlock(id)` (nobody signed in): sets `user.unlockAskedAt`, audit `user.unlockAsked`,
  notification `account.unlockAsked` (link `team/<id>`) to the accounts that may reset the password —
  `Permissions.canResetPassword`: `employees.manage` (quality, director, IT), or the new right `password.team.reset`
  (team lead) for the people below him in his sections (`canSeeUser`); never oneself; IT not notified. Signing in after
  all closes the request (`Store.clearPasswordUnlock`, called by `Auth.openSession`). (2) Code by e-mail / SMS:
  shown, inactive until the company server (no e-mail nor SMS can be sent from the browser alone); contact fields
  `user.email` / `user.phone` (Profile, and the Team file for the managers; shown only within `canSeeUser`).
  `Store.resetPassword` (via `Auth.resetPassword`, which also removes PIN / fingerprint): password cleared, request
  closed, notification `account.passwordResetMine` to the person and `account.passwordReset` to the other managers.
  Team list: badge "Unlock asked"; file: banner with the reset button; `#team/<id>` opens the file (`TeamPage.setTab`).
  The confirmation e-mail comes with the server. Limit: like every request today, stored on THIS device.
- **4.4.0 — reports and the person who clocks**: Reports → one **Export** button → window (PDF / Excel, parts:
  summary, hours to be paid, time off, chart, monthly table with or without the weeks, several technicians: one report
  each or the team table, language of the document); choices kept in the setting `reportExport`. `page-reports.js`
  computes per WEEK (Thursday rule) and sums into the month — the month figures are unchanged; leave and time off stay
  counted by calendar month (`Hours.timeOffTaken` accepts `from` / `to`, a week shows its days inside the month).
  `report-doc.js` (ReportDoc) draws the A4 landscape document (logo `images/logo.png`, pages cut with fixed row heights,
  header / column titles / footer on every page) and the Excel workbook (`Xlsx` rows may carry an outline `levels`:
  weeks foldable under their month). The document is built inside `I18n.withLanguage(code, fn)`: the app keeps its
  language. `Utils.printHtml` waits for the logo and the fonts before printing. Same screen also: shortcuts "This
  month" / "This year", tile "Absences" (other approved absences), card "Time split" per activity. Dashboard of the
  person who clocks: "Clocking saved at hh:mm" (`UI.punchLine`, also on the clock page), **Request leave** button
  (`LeavePage.openNewRequest`), day badge "Compliant / To check" (`DashboardPage.dayCompliance`, same thresholds as the
  managers' compliance, information only), block "My calendar" (clocked / leave / absence / holiday per day).
- **4.4.1**: report weeks holding hours imported from an Excel file (`entry.imported`) carry an extra "Excel import"
  mark next to their validation state (PDF and Excel). User menu: **Dark mode / Light mode** button (`#themeButton`,
  same setting `theme` as Settings → My workspace).
- **4.5.0 — annual target (decisions of 17/11/2026), stage 1**: `hours.js` holds ONE calculation for every screen:
  `monthFigures` / `weekFigures` (moved from page-reports.js; the dashboard month recap uses it too, so its "result"
  now follows the register "OK" method like the reports), `contractOn` (contract in force: `user.contracts` =
  [{ from, weeklyHours, normalHours, workDays }], the team rule before the first one), `targetBetween` (calendar-day
  prorata: every employed day is worth weekly × 52 ÷ 365 or 366, from `hireDate` to `leaveDate`, contract by contract),
  `hoursBetween` (worked = every clocked hour, "validated" = weeks validated by the team lead or locked; assimilated =
  holidays on a working day and approved absences of EVERY type, worth weekly ÷ working days of the contract; valued =
  worked + assimilated, no double count) and `yearProgress` (annual target, target to the end of a report — never after
  today —, gap, remaining). Used by the report (goal in the technician band, Excel summary), the Team file (contracts,
  leaving date) and the dashboard (block "Annual target"). Report: recovery earned / taken / balance (`recoveryBalance`,
  the dashboard function). New clocking category `training` (working time). **Stage 2 (to do with the managers)**: use
  the individual contract in the weekly calculation (weekly goal, 25 % / 50 % thresholds) — today weeks keep the team
  rule.
- **Colours in JS** (on screen only): hero ring, "week to review" icon, avatars' first colour, report chart (CSS
  variables `--chart-*`, light / dark). Printed / exported documents (PDF, HTML, Excel) keep their 3.x colours.

- **4.5.1 — Excel register import with pre-validation**: `RegisterImport.analyse(sheet)` reads the sheet exactly like
  `importSheet` (same `dayPlan`, same duplicate rules, nothing written) and gives the period, days, hours, time-off days,
  duplicates, overlaps, days to check and a month-by-month table; the import runs only on "Validate the import". The
  summary of the last import is kept in the person's data (`perUser.lastImport`, `Store.setLastImport` / `lastImport`)
  and shown on the timesheet until the next one.
- **4.6.0 — "Clockings" page and steering explanations**: `page-clockings.js` (`ClockingsPage`, route `#clockings`, right
  `reports.team.view`) shows the technicians of the perimeter week by week (one cell per day) or month by month (one
  cell per week). No calculation of its own: `Segments.day` / `weekSheet`, `Hours.weekSummary`, `DashboardPage.
  dayCompliance`, `ValidationPage.badgeOf`. A click on a day opens its segments below the table, with links to the full
  timesheet (`#team/<id>`) and to the correction (`Editor`). The file of a technician (Team) now opens on its timesheet;
  profile, contract and rights are in the "Profile and contract" tab. The four "Steering" tiles of the director's
  dashboard open, inside the tile, the detail of their figure for the current month (by week and by technician, from
  `Hours.monthFigures` / `recoveryBalance`, total = figure of the tile); their ⓘ button opens the explanation (4.6.1).
- **4.7.0 — navigation**: menu built from the rights as before (`App.ORDER`, `PAGE_RIGHTS`); "Reports" is labelled
  "My hours" without `reports.team.view` (`App.labelOf`). `ValidationPage` holds four tabs (weeks, leave — drawn by
  `LeavePage.queueInto`, error reports, history); `TeamPage` holds "Clockings" (`ClockingsPage.init(zone)`) and
  "Employees"; `SettingsPage` groups its tabs (`GROUPS`) with second-level tabs (`UI.tabs(..., "sub")`). Old addresses
  are redirected by `App.show` (`MOVED`). State of the app / network: `App.connectionState` (`StorageAdapter.mode`,
  `navigator.onLine`, `navigator.connection.type`).
- **4.7.1 — dashboard packing**: `Layout.pack(grid)` gives each block `grid-row-end: span n` (rows of 4 px, the space
  between blocks is their bottom margin) from its content height; `grid-auto-flow: dense` fills the holes; a
  `ResizeObserver` repacks when a block changes size. Drag and drop (`Layout.sortable`): one move per animation frame,
  swap past the middle of the neighbour only, never back with the block just passed.
- **Limit (unchanged, see §10)**: every screen shows the data of THIS device only — the managers' screens become live
  with the company server (decision of 18/11/2026: internal IIS server, to be set up with IT).

## 10. Points to adapt for a future platform

| Point | Today | Tomorrow |
|---|---|---|
| Storage | `storage-adapter.js` (localStorage) | adapter to an API or a remote store, same functions |
| Personal display settings | per account, **on this device** | follow the account on every device once synchronised |
| Sign-in | local password (SHA-256) | the company's identity provider |
| Permissions | checked in the browser | **checked again on the server** (`permissions.js` is the reference of the rules) |
| Audit trail | stored on the device, included in backups | central log, not editable |
| Synchronisation | **none** (a single device) | stable identifiers and `deviceId` already in place; conflict rules to define |
| Payroll | Excel / CSV exports | adaptation layer to the chosen payroll software (no format invented) |
| Notifications | inside the app | e-mail / SMS, push notifications |

## 11. What stays in French on purpose

The code, the comments, the documentation and the tests are in English. These items stay in French because changing
them would change the behaviour, the appearance or the compatibility with existing data:

| Item | Where | Why |
|---|---|---|
| French interface texts | `js/translations.js` (first column of each entry) | The app is in 4 languages; French is one of them |
| Field names of the v1 format (`pointages`, `demandes`, `profil`, `heureRappel`…) | `store.js` (`migrateV1`) | Reading data saved by the first versions |
| CSV import aliases (`travail`, `trajet`, `conge_paye`…) | `hours-csv.js`, `page-leave.js` | Files written in French are still accepted |
| Column titles of the managers' Excel register (`Heures de Travail`…) | `register-import.js` | They are matched against the real file |
| Reference accounts, job titles and sections (`Nord`, `Sud`, `sec-nord`, `sec-sud`) | `store.js` (`SEED_USERS`, `SEED_SECTIONS`) | Company data shown on screen and stored identifiers |
| Home-screen shortcut names | `manifest.json` | Shown on the phone; the manifest has no translation mechanism |
| Expected French texts in `tests/ui.js` | tests | They check what the French interface really shows |
