# CHANGELOG — My Time Keeper (formerly "AC Conger Payer + pointage")

The consolidation mission was requested as "V2.7". Version 2.7.0 already existed (company colours, responsive
tabs), so the consolidation was numbered **2.8**. Dates are written day/month/year.

## 4.7.1 — Dashboard blocks: moving and packing, technician screens (18/11/2026)

- **Moving blocks** (Personalise): a block now swaps only once the pointer passes the middle of its neighbour, and never
  back with the block it has just passed — no more blocks jumping back and forth while the page reflows under the
  pointer; one move per frame.
- **Packing**: each block takes the height of its content and the holes are filled ("wall of blocks", `Layout.pack`,
  recomputed when a block changes size) — no more stretched empty cards next to a tall block (validation, requests,
  annual target). The small figure widgets keep one common height on a computer.
- **Technician screens**:
  - Clock in: the star (favourite client) has the height of the list and is aligned with it; favourite / recent clients
    are shown under the list (they were above its title); the decorative ring stays behind the clock figures; with no
    client, a technician no longer reads "add some in the Clients tab" (a tab he does not have).
  - Leave: subtitle without "the team's absences"; current week card: "−19 h 24" in big and "still to work" under it
    (it wrapped on two lines); "time off taken" no longer shows "−0 h 00".
  - My hours: "This year" starts at the hiring month (no empty months before it).
  - Home: the leave ring shows its percentage.

## 4.7.0 — Navigation reorganised, app and network state, clean-up (18/11/2026)

- **Menu** (decision of 18/11/2026): managers and team lead 7 → 5 entries + Settings at the bottom — Home, To validate,
  Leave, Team, Reports; technician: Home, Clock in, Leave, My hours, Settings.
  - **To validate** = weeks + leave decisions (moved from Leave → Requests, no second list) + error reports + history,
    each tab with its counter.
  - **Team** = Clockings (former "Clockings" page) + Employees (list and files; a file opens on its timesheet, the
    profile and contract in a second-level tab).
  - **Leave** = consultation: my requests and balances (who requests leave), calendar, team balances.
  - **Settings**: 10 tabs → 4 groups with sub-tabs — My account, Company, Data, Help (reference document, reading the
    report).
  - Old addresses redirected: `#leave/requests` → `#validation/leave`, `#clockings` → `#team/clockings`.
- **Tabs**: level 1 36 px / 14 px on one line (horizontal scroll on phone), level 2 30 px outlined, counters as pills,
  16 px between tabs and content; side menu 40 px entries, 4 px apart, Settings separated.
- **Phone**: bottom bar without Settings (gear in the top bar) — 5 entries at most.
- **State of the app and of the network** under "My Time Keeper" (every profile): "Local mode" today ("Connected" once
  the company server answers, `StorageAdapter.mode`), "Online · Wi-Fi / mobile network" or "Offline" (network type
  when the browser gives it). Same state, as two dots, in the phone top bar (replaces the former "Offline" text).
- **Clean-up**: unused exports removed (27 names in 10 modules), duplicated translations merged (19 keys) and 3 unused ones removed, duplicated
  CSS rules merged, unused `.cols-4` grid and dead tab styles removed, second list of leave to decide removed.

## 4.6.1 — Steering: detail of each figure (18/11/2026)

- **Dashboard → Steering** (director): a click on a tile now shows where its figure comes from, for the current month:
  by week (week number and dates) and by technician, with a total equal to the figure of the tile. "Accumulated time off":
  balance by technician. The ⓘ button of each tile keeps the explanation of what the figure means (one panel at a time).

## 4.6.0 — "Clockings" page, steering explanations (18/11/2026)

- **New "Clockings" page** (team lead, quality manager, director): the clocking of each technician day by day, like the
  managers' Excel table. Week view: one row per technician, one cell per day (hours, first → last time, clocking
  running, leave / absence, holiday, day to check against the thresholds), total, result of the week, validation state.
  Month view: one cell per week (hours + state), a click opens the week. A click on a day opens its detail below the
  table (segments, clients, total) with "Open the full timesheet" and "Correct the day" (managers). Section filter.
- **Team → file of a technician**: opens on the timesheet; profile, contract and rights move to a "Profile and contract"
  tab (no more scrolling past the form).
- **Dashboard → Steering** (director): each of the four tiles opens, inside itself, a short explanation of its figure
  (what is counted, period, curve). Note: the curve of "Accumulated time off" shows the night hours (as before).
- Known limit, unchanged: data stay on the device until the company server (solution A, decided on 18/11/2026).

## 4.5.1 — Excel register import: pre-validation (18/11/2026)

- **Pre-validation** before any import of the managers' Excel register (Team → person → Timesheet → Import), for a file
  with one sheet or several: period found, days to import, hours (work + travel), time-off days, duplicates skipped,
  a table month by month and the days to check grouped by reason. Nothing is written before "Validate the import";
  "Cancel" leaves the data untouched. Changing the sheet in the list recomputes the preview. Same reading as the import
  (`RegisterImport.analyse` / `importSheet` share `dayPlan` and the duplicate rules).
- **Sentence kept on the timesheet** after the import: date, time, who imported, sheet, days, period, hours, time-off
  days, days to check, duplicates. Stored with the person's data (`perUser.lastImport`), shown until the next import.

## 4.5.0 — Annual target, contracts, training (17/11/2026)

Decisions of 17/11/2026: prorata in calendar days (365 / 366, following years included); worked = every clocked hour
with "of which validated"; every approved absence type assimilated; training added to the clocking; done in 2 stages.
- **Annual target** computed automatically for each person: weekly hours × 52 × employed days ÷ days of the year, from
  the hire date to the leaving date, contract by contract (39 h → 169 h a month → 2 028 h a full year; Alexandre,
  hired on 04/05/2026: 1 344 h 36 for 2026).
- **Reading guide** "How to read the time report" in Settings → Reference document (and in the printed / downloaded
  reference document), 4 languages; a short line under "Export" in Reports points to it.
- **Three counters**: worked (every clocked hour, of which validated), assimilated (holidays not worked, paid leave,
  time off, justified absences, family events, training, other — worth the contract hours of a day), valued = worked +
  assimilated. Never counted twice.
- **Report** (PDF and Excel): goal in the technician band — valued / annual target, % done, target to the end of the
  report, ahead / behind / on target, remaining, worked (validated) + assimilated. Recovery: earned, taken and
  **available balance**. Chart values written vertically (readable with 12 months); months lists on two columns beyond
  6 months (they were cut at the bottom of the page).
- **Team file** (Yann, Jérémie): **leaving date** and **contracts** with their start date (hours a week, of which normal,
  working days; hours a month computed); before the first contract, the team rule (39 h).
- **Dashboard** of the person who clocks: block **Annual target**. The month recap now uses the same calculation as the
  reports (its "result" follows the register "OK" method).
- **Clocking**: new activity **Training** (working time).
- Not changed (stage 2): weeks are still computed with the team rule (39 h, 25 % from the 40th hour).

## 4.4.1 — Excel import mark, theme button (17/11/2026)

- Report (PDF and Excel), detail of the weeks: a week whose hours were imported from an Excel file shows
  **Excel import** next to its state (e.g. "Not sent yet · Excel import").
- Header, user menu: **Dark mode / Light mode** button — the theme can be switched in one click (same setting as
  Settings → My workspace → Theme, which also works when index.html is opened by double-click since 4.2).

## 4.4.0 — Report export, PDF redesign, technician dashboard (17/11/2026)

No change of business rule: every figure comes from the existing engine.
- **Reports → Export**: one button opens a window — PDF or Excel; parts to keep (summary, hours to be paid, time off
  follow-up, chart, monthly table **with or without the detail of the weeks**); for several technicians, one report each
  or the team table only; **language of the document** (FR / EN / ES / DE, the app keeps its own). Choices remembered.
- **New PDF** (A4 landscape, validated mock-up): Auxiliar Conservera logo, technician band, 7 indicators, "Summary of the
  hours to be paid", "Time off hours follow-up" (result and time off taken shown apart, no balance computed), chart, then
  the monthly table — each month followed by its weeks with their validation state, total in burgundy, a month never cut
  between two pages, header and footer (page n / N) on every page.
- **Excel**: one sheet per part (one per technician when several); weeks grouped under their month (fold with "+").
- Reports screen: shortcuts **This month / This year**, tile **Absences**, card **Time split** per activity.
- Dashboard of the person who clocks: **Clocking saved at hh:mm** (also on the clock page), **Request leave** button,
  badge **Day compliant / To check** (10 h a day, meal after 6 h, 11 h rest — information only), block **My calendar**
  (clocked days, leave / time off, other absences, holidays).

## 4.3.1 — Sign-in keypad of the mock-up (17/11/2026)

- On-screen keypad replaced by the one of the mock-up: digits only, full width, 1 to 9, a wide 0 and erase; no grey
  box. Same pad on the PIN screen. A password containing letters is still typed with the computer or phone keyboard.
- Password fields (sign-in, first password, profile): eye button to show / hide what is typed.
- Links under "Sign in" closer together; sign-in and PIN still fit a 1 280 × 720 screen without scrolling.

## 4.3.0 — Forgotten password (17/11/2026)

- Sign-in (password and PIN screens): **Forgot your password?** opens two options:
  1. **Ask my manager to unlock my account** — the request goes up the hierarchy: technician → team lead (Enrique),
     quality manager (Yann) and director (Jérémie); team lead → Yann and Jérémie; Yann ↔ Jérémie. They get a
     notification that opens the person's file (Team), where a banner offers **Reset the password**. One request at a
     time; it closes by itself if the person signs in after all.
  2. **Receive a code by e-mail or SMS** — shown but inactive: a browser alone cannot send e-mails or SMS; it will work
     with the company server. E-mail and mobile phone can already be filled in (Settings → Profile; managers in the
     Team file), visible only to the person and the people above them.
- **Who may reset**: Yann and Jérémie (everybody but themselves), and now Enrique for the technicians of his sections
  (new right "Reset the password of the people of one's team"). After a reset: the person is told at the next sign-in,
  the other managers get a notification, everything is in the audit trail. The confirmation e-mail comes with the
  server.
- Limit (unchanged): like the leave requests, the request is stored on this device until the server exists.

## 4.2.0 — Clean code, theme by double-click, on-screen keyboard (17/11/2026)

No change of business rule (hours, leave, rights).
- **Theme**: the Light / Dark choice (Settings → My workspace) now also works when `index.html` is opened by
  double-click (before, the browser refused and the device theme stayed).
- **Reference document**: the credited day reads "+7 h 48 (39 h 00 ÷ 5)", "Monday → Friday" — the real rule (it
  still said 39 h ÷ 7, Monday → Sunday, from version 2.5). The texts are computed from the time rules.
- **Sign-in keyboard**: one layout that fills its box — digit row, letters, shift / erase, symbols; no ABC / 123
  switch. PIN: narrow phone pad. The title no longer touches the field; the language selector no longer covers the
  card; sign-in and PIN fit a 1 280 × 720 screen without scrolling.
- **Phones**: the password fields open the normal keyboard (they opened the numeric one, although a password may
  contain letters).
- **Code**: style sheet cleaned (387 overridden declarations and 6 unused classes removed, 49 rules merged: 1 379 →
  1 296 lines, identical display checked element by element); copies of the same code replaced by shared helpers
  (days format, printing, state of a person, name of an account, password field, rights of the two managers,
  period of a right); functions never called removed. Documentation and file headers updated.

## 4.1.8 — Link to the collective agreement (16/11/2026)

- Reference document (every profile): link to the metal-industry collective agreement (IDCC 3248) on
  code.travail.gouv.fr, in addition to the existing content.

## 4.1.7 — Rules with Edit / Validate, sections editable, hire date (16/11/2026)

Includes the corrections given as edit blocks in 4.1.3 → 4.1.6:
- 4.1.3: no breadcrumb; every page: title + description on the left, bell + profile on the right, then commands, then
  content.
- 4.1.4 / 4.1.5: Leave & absences — smaller "+" at the right end of the tab line; month calendar exactly the height of
  the window (the page scrolls only when needed).
- 4.1.6: Jérémie (director) has all the rights, like Yann (corrections, time rules, clients, balances, full backups,
  sensitive absences); his dashboard keeps the steering view.

New in 4.1.7:
- **Time rules**: locked by default; **Edit the rules** unlocks them, **Validate the changes** saves everything at once,
  **Cancel** drops the changes; message + notice "n change(s) saved — details in Settings → Audit trail; the technicians
  are informed" (one notice for all the changes). The audit trail shows each rule by its name (not its code), with
  before → after values rounded and "yes / no" for the options.
- **Sections**: **Edit** (name + people attached, managers shown as "all sections") and **Delete** — only when nobody is
  attached any more (disabled accounts included), with confirmation; every change written in the audit trail.
- **Hire date**: nothing is counted before it — no credited holiday or leave, and the goal of the hiring week is
  lowered day by day (prorata). Reports, dashboards and timesheets of every technician follow; the reports say
  "Hours counted from the hire date: …".
- Dashboards: Customise / Validation / Leave buttons on the line of "Your team — sections …", on the right.

## 4.1.2 — Settings layout, on-screen keyboard (13/11/2026)

- Settings: Profile, My workspace, Preferences and Backup show their cards on two balanced columns on a computer
  (one column below 1 100 px) instead of full-width forms; tables and rule grids (Time rules, Clients, Sections,
  Rights, Audit trail, Reference) keep the full width. Spacing of the help texts tightened; PIN confirmation labelled
  "Confirm the PIN code".
- Sign-in: on-screen keyboard under the password (and the first password, and the PIN): type with the keyboard OR
  click / tap the keys — digits, letters (AZERTY in French, QWERTZ in German, QWERTY otherwise), capitals, common
  symbols, erase. Digits only for the PIN.

## 4.1.1 — Who is counted, clock page proportions (13/11/2026)

- Dashboards of the team lead, the quality manager and the director: filter **"Team shown"** — whole team, one section
  (Nord, Sud…) or one technician; every block follows (banner, to do, tiles, technicians, month summary, activity).
  The names counted are written next to the filter, and the director's banner says which team it shows.
- Clock page (technician): live card and "My week" sized down — clock 28 → 36 px, fields 40 px, activities 56 px,
  start button 44 px, week ring 96 px, figures 20 px, week bars 88 px; the two cards no longer stretch each other.
- Review of every tab and sub-tab of the four profiles at 1440 × 900, 1366 × 768 and 390 × 844: empty zones no longer
  add a gap, counters in titles at their normal size, section comparison labels on one line, report chart 150 px.

## 4.1.0 — Proportions (13/11/2026)

Same design, same functions; sizes and spacing corrected everywhere.
- One type scale (page titles 24 → 30 px, sections 18 px, text 15 px, secondary 13 px, captions 12 px) and one spacing
  scale on multiples of 4 px, as CSS variables; fluid sizes with `clamp()`.
- Container limited to 1 320 px with balanced margins; cards 24 px padding (16 px on phone), 20 px between blocks.
- Buttons and fields 40 px with a mouse (44 px on touch screens), small buttons 32 px, tabs 30 px; avatars 36 px.
- Navy blocks: live clocks 36 → 48 px, KPI values 22 → 26 px, dashboard ring 128 px (the former `scale()` removed).
- Sign-in following the brief: left 34 % (logo 44 px, clock 64 → 88 px, date 16 → 18 px, padding 32 → 40 px); card
  centred, max 740 px, padding 32 → 40 px, title 28 → 34 px, accounts 76 px high, avatars 42 px, names 15 px, 12 px
  gaps, two columns when there is room.
- Checked at 1920 × 1080, 1440 × 900, 1366 × 768, 1024 × 768, 768 × 1024 and 390 × 844 on 14 screens (no horizontal
  overflow).

## 4.0.3 — Lighter sign-in screen (13/11/2026)

- Search by name removed (not needed).
- Smaller scale, as asked: whole sign-in page about 80 % of 4.0.2, profile card about 65 % (card 690 px wide,
  smaller avatars, text and spacing). Same layout, accounts and steps.

## 4.0.2 — Sign-in screen like the mock-up (13/11/2026)

- Full navy screen with burgundy curves; on the left the My Time Keeper brand, the big clock with the date and the
  Auxiliar Conservera logo; on the right a large white card: "Hello 👋", "Select your profile to continue", search by
  name (filters the list on screen), accounts on two columns with chevrons, "first sign-in" badge with a dot,
  information line at the bottom. Language selector at the top right (globe).
- Same accounts, same steps (password, PIN, fingerprint, first password); phone: single column, compact header.

## 4.0.1 — Closer to the mock-ups, denser screens (13/11/2026)

- Computer header like the mock-ups: breadcrumb (first page › current page), bell, user chip with a menu (My profile,
  Sign out). The side menu keeps the same pages; its bottom keeps the Auxiliar Conservera logo and the language.
  Phone and tablet: unchanged top bar and bottom tabs.
- Lighter screens: smaller tabs (sized to their text), buttons and fields one notch smaller with a mouse (touch keeps
  44 px), less padding in cards, tiles and hero, wider work area (1 440 px).
- Leave calendar (month): the cells follow the window height — the whole month fits in one screen; filters on one line.
- Discreet burgundy curves in the page background and on the sign-in panel; accent line and chevrons on the sign-in card.
- Menu labels, Team and Settings layouts unchanged (your choice); no search on the sign-in screen.

## 4.0.0 — New visual identity "Corporate Dark + Soft Premium" (13/11/2026)

Same application: functions, menus, screens, routes, data, rights, translations and sign-in unchanged (3.3.0 included).
- Charter in CSS variables: navy #111D2D (menu, navigation, top bar, hero blocks, sign-in panel), burgundy #801F35
  (main buttons, active menu item, accents), background #F3F2EF, white cards, text #172033, muted #737B89, borders
  #E6E7EB, statuses green #15803D / orange #D97706 / red #DC2626 on tinted backgrounds.
- Components: cards 18 px, buttons 11 px with hover / focus / disabled states, fields with a discreet burgundy focus,
  sober tables with header band and row hover, softer dialogs, transitions 180 ms; dark theme kept.
- Icons: Lucide (same places, same meaning).
- Side menu: original Auxiliar Conservera logo added in the brand zone; My Time Keeper logo kept at the top.
- Theme colour of the browser / installed app: navy.
- Exported and printed documents keep their former colours (not part of the screens).

## 3.3.0 — Presentation, accesses, quick sign-in (13/11/2026)

- **Presentation at the first sign-in** (computer, tablet, phone): 7 short steps, the same for everybody, can be
  skipped, seen again from Settings → Preferences → "See the presentation again". Every account sees it once after
  the update.
- **Accesses like the other apps**, asked only on a tap: notifications (people who clock), protected data
  (the browser does not erase the data when space is lacking), installation of the app. Card "Accesses of the app" in
  Settings → Preferences (now shown to every account); the former "Enable notifications" button moved there.
- **Quick sign-in on this device** (Settings → Profile): 4-digit PIN code and fingerprint / face (Windows Hello,
  Touch ID, Face ID, Android). Current password asked; 5 wrong PINs remove the PIN; the password stays possible;
  a reset by a manager removes both. Fingerprint only through an https address.
- Not done: **location** (needs a decision, see the open points).
- New files `js/welcome.js`, `js/quick-unlock.js`, `tests/quick.js`; `CACHE_VERSION` `acp-v30`.

## 3.2.0 — Personal workspace (13/11/2026)

Display only: no change to hours, clocking, leave, validation, rights, accounts, sign-in, reports, imports / exports,
backups or data.
- **Settings → My workspace** (new tab, every account), "Customise my workspace": theme, menu position (left / right
  only), start page, menu tabs, dashboard blocks and widgets, reset of the dashboard layout and of the whole
  presentation.
- **Menu tabs**: drag and drop by the handle (mouse, touch, keyboard arrows), up / down buttons kept, show / hide,
  default order. Hiding a tab removes nothing and changes no right (3.1 behaviour kept).
- **Dashboard**: each block and widget can be moved (drag and drop), hidden / shown and resized (1/4, 1/3, 1/2, 2/3,
  full width, depending on what its content accepts), from Settings or directly on the dashboard with **Customise**.
  Original layout unchanged until the person changes it (12-column grid with the same widths; the 2/3 + 1/3 rows are
  about 6 px different).
- **Saved per person** with his settings (`dashLayout`), found again after sign-out, refresh or closing the browser;
  never shared; validated in personal and full backups; data from 3.1 opens with the original layout.
- **Preferences** tab: keeps the reminders and the absence for replacements; shown only to the accounts concerned.
- New file `js/layout.js`; `CACHE_VERSION` `acp-v29`.

## 3.1.1 — Source code in English (13/11/2026)

No change in behaviour or appearance.
- Documentation translated into English: `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md` (formerly
  `CHANGELOG_V2.7.md`), `MANUAL_TESTS.md` (formerly `TESTS_MANUELS.md`), `tests/README.md`.
- Automated tests: comments, check labels and sample texts in English (the expected **French screen texts** stay,
  since those tests check the French interface).
- Leave counting rule: stored values `"ouvres"` / `"ouvrables"` renamed `"monFri"` / `"monSat"`; data saved by
  3.1.0 is converted automatically on load.
- `ARCHITECTURE.md`: permission table regenerated from `js/permissions.js` (it still showed the 2.8 matrix).
- What stays in French on purpose, see `ARCHITECTURE.md` § 11.

## 3.1.0 — Feedback from the test of 12/11/2026

1. **"Undo" countdown (10 s)**: the banner is no longer rebuilt every second (it blinked); only the figure and the bar
   change, and it disappears at 0.
2. **Home work**: normal timer clocking, like the other activities. The fixed day (one tap) becomes an employer rule,
   off by default ("Fixed home day"). Clocking can no longer start on top of hours already recorded (declared day,
   import). Still available as rules: 7 h maximum per home day and goal reduced by 0 h 48 per home day.
3. **Leave counted Monday → Friday** (French "jours ouvrés"): a week = 5 days, 25 days a year (25 ÷ 12 a month),
   equivalent to 30 days counted Monday → Saturday. Rule "Leave counting" (Mon–Fri / Mon–Sat). Saturdays, Sundays and
   public holidays are neither counted nor drawn.
4. **Calendar**: one line per person and per week (continuous band), round badge with the person's initials and
   colour, background = absence type, holiday name next to the day number, own colour for "Training".
5. **Display preferences (every account)**: automatic / light / dark theme, menu on the left or on the right (bottom
   bar on tablet and phone), order and hiding of the tabs (dashboard and settings always visible; rights unchanged).

## 3.0.1 — Feedback from the test "Alexandre's leave → Enrique's validation" (12/11/2026)

1. Calendar: a leave is drawn and counted only on working days (Monday → Saturday at that time), never on Sundays
   nor public holidays.
2. Notifications: the whole message is clickable and opens the page concerned (validation, my requests, timesheet,
   rights…), for every account; it is marked as read.
3. Team lead dashboard, "Next week": day and date on two aligned lines, one coloured bar per day of absence, Sundays
   and holidays greyed out.
4. Validation tab: leave and absences to decide are shown with the weeks; the menu counter includes them.
5. "New request" button replaced by a "+" (the type is chosen in the form).
6. A waiting request is clearly visible to the managers (tinted background + dashed border): preview before deciding.

## 3.0.0 — MY TIME KEEPER: HIERARCHY, REGISTER "OK", LEAVE, ACCOUNT (10/11/2026)

Starting point: 2.9.1 (2,895 checks). Decisions: 45-point questionnaire and the managers' register "2026 – OK"
(10/11/2026). Points still open are **rules** set to the proposed default, editable by the managers
(Settings › Rules); every change is announced to the technicians.

**Name and logo**: "My Time Keeper", black and white clock icon with red hands, Auxiliar Conservera logo unchanged as
a badge and as the signature on the sign-in screen. The data key (`acp_data_v5`) and the backup identifier do not
change: no data lost.

**Hierarchy**: people only see the people below them (quality manager and director see each other); a technician
sees nobody. The team lead no longer requests leave for himself, nor do the quality manager and the director; he
validates his technicians' leave (the first validation among team lead, quality, director is final — rule 10.1) and
sees their balances (Balances tab). New "IT department" role: accounts, rights, backups, no access to hours or leave.
Replacements: team lead away → quality / director lock directly; quality and director away → the team lead's
validation is final ("My absence" in Preferences). The team lead can ask for a locked week to be unlocked.

**Hours — register "OK" method (default)**: credited day 7.8 h (39 ÷ 5) Monday → Friday; every hour above 39 h valued
× 1.25 (night 25 % and holiday 50 % premiums added first); a week under 39 h = 0; weeks 22 to 39: overtime **paid**
("To pay" counter), the rest banked as time off; time off taken recorded apart; Sunday + 100 % in a separate counter
(art. 146 of the metal industry agreement); urgent work during leave: paid + 50 %, outside the value of the week.
Checked week by week against the register (45 weeks, 43 identical, 2 differences caused by the register).
The 2.9.1 method (countdown) stays available as a rule.

**Leave**: 2.5 days a month from May to May, days Monday → Saturday, half days, notice periods (1 day → 2 days,
2 to 5 days → 1 week, > 5 days → 2 weeks; request flagged, or refused depending on the rule), cancellation of an
approved leave on request, overlap flagged to the managers, balance exceeded flagged, carry-over of the previous
period on request and validation, new types (justified absence, family event, training, other with a mandatory
comment). The reason of a justified absence is only visible with the "sensitive absences" right.

**Account**: "My preferences" for everyone (start page), sign-out after 15 min of inactivity, account deletion request
to the managers, export of one's own data (Backup tab).

**Reports**: "To pay" column (summer + urgent work), "Result" = time off.

⚠️ Good to know: with the register method, overtime from June to September is paid; the time off taken (117 h for
Alexandre in 2026) is deducted from the rest of the year — his time-off counter is therefore negative (−33 h on
08/11/2026). This is a direct consequence of the register; to be confirmed by the managers.

## 2.9.1 — Adjustments after testing (10/11/2026)

- Even spacing: a single rhythm (1.1 rem) between all blocks and inside grids; cards of the same row have the same
  height. Technician dashboard reorganised: My week | My requests, then Validation | Summary, then Activity. Menu:
  same height for every tab, hover only with a mouse.
- Sign-in: no role shown in the list of profiles; the "first sign-in" label only for technicians (same in the team
  for "no password yet"). Once signed in, the status in the company (role, job, sections) is shown under "Hello".
- Reports: team lead and managers choose several technicians (multiple choice, limited to their sections); one chosen
  = month by month, several = one row each; chart and exports follow the choice.

## 2.9.0 — DESIGN OVERHAUL, WEEK VALIDATION, CLOCKING SAFEGUARDS (10/11/2026)

Starting point: 2.8.0-beta.6 (2,450 checks passing).

**Design (mock-up approved on 10/11/2026)**: dark side menu, "hero" blocks, progress rings, sparklines, week bars per
activity, one icon per activity, avatars with live status, red counters in the menu, two-panel sign-in, dark mode,
embedded fonts. Bottom tab navigation on tablet and phone (< 900 px) — fixes the missing navigation between 480 and
899 px.

**Dashboards per profile**: technician, team lead, quality manager, director (see ARCHITECTURE § 9).

**Clocking**: client → activity → start in a single block; favourite and recent clients; "Undo" 10 s after each
action; 10 s countdown before 21:00 (no answer: departure at 21:00 and flagged); leave / time-off status read from the
calendar; urgent work possible during a day off (day still counted + hours with a 50 % premium).

**Week validation**: sent by the technician, validated by the team lead, locked by quality OR director, returned with
a comment, "Validation" page, visual follow-up showing who decided. The previous week must be sent before clocking.
A locked week cannot be modified.

**Rule changed**: a day of leave / time off that was worked stays credited and counted (before: not credited, not
taken). New rules `absenceWorkedRate` (50 %), `undoSeconds`, `nightCountdown`, `weekClosureRequired`.

**Reports**: month-by-month chart. **Team**: progress of the week and validation state per person.
**Calendar**: names of public holidays, holidays hatched (no longer confused with the active tab colour).

**Tests**: new suite `tests/week-clock.js` (68 checks); interface journeys added (closing, undo, validation by the
team lead then the director); engine tests updated for the new rule.
Total: **2,892 checks, 0 failures** (Excel register not provided: suite skipped).

**Open decisions**: compliance thresholds (10 h / 48 h / 11 h / meal after 6 h / clocking open 16 h).

## 2.8.0-beta.6 — CLEAN-UP, BATCH 1: backups and data integrity (10/11/2026)

Starting point: 2.8.0-beta.5 (original copy kept), reproducible initial state: 2,346 checks passing.

**Anomaly C1 fixed** (critical) — first reproduced by a test on the original code: a modified personal backup raised the
"taken" leave balance from 0 to 9 days, added an entry and a shared client, without any trace.
- **Personal** restore limited to personal settings; entries, requests, balances and clients of the file are never
  written (they are counted and reported as ignored). Safety copy of the settings before restoring.
- **Full** restore reserved to `backups.manage`, checked in the logic; strict validation of the file (new
  `js/validation.js`); any inconsistent, forged or forbidden data refused; **preview** with no writing before
  restoring; safety copy read back; audit events (author, date, scope, result), refusals included.
- Interface texts fixed: the personal button promised to "replace ALL data".
- No design change (same components, same styles).

**Tests**: new suite `tests/backup-security.js` (74 checks: injection of approved leave, of an entry, of a client, of
invalid settings; refusal for technician, team lead, director; 14 forged full files; preview; safety copy; audit trail)
+ interface scenarios (preview, refusal without confirmation, technician restore) + check on the real register data
(no false positive). **Counter-test**: three protections switched off one by one, each time detected. Suite stabilised
by 30 consecutive runs. Total: **2,479 checks, 0 failures** (all run).

**Findings during the batch**
- My first replacement in `page-admin-panels.js` duplicated code (marker present twice): detected by the syntax check,
  file redone from the original.
- One test was unstable (order of audit events with the same millisecond): made order-independent. To handle in the
  "audit" batch: add a sequence number for a deterministic order.
- The v3 migration test data was unrealistic (decision without a date): completed as the real 2.7 wrote it (checked
  in the 2.7 code: `decidedBy` and `decidedAt` together, `imported: true` for imported history).
- `Store.testRestore` is kept (alias of `previewRestore`) for the existing screens and tests.

**Documented limit**: a manager with `backups.manage` can restore *consistent* data he forged himself; the traceability
(audit trail, safety copy) makes it detectable, not preventable.

## 2.8.0-beta.5 — IN PROGRESS ("evolution per profile" mission, 06/11/2026)

**Permission matrix and profiles**
- New matrix (names of the mission: `timeclock.*`, `leave.*`, `employees.*`, `reports.*`, `settings.*`,
  `permissions.*`, `backups.manage`, `audit.view`); full table in `ARCHITECTURE.md`.
- Four roles: technician, team lead, **quality manager** (Yann Lefloc'h), **director** (Jérémie Augé).
  Quality = control, corrections, settings, backups; director = steering, consulting settings and corrections. Both:
  accounts, rights, global view, leave decision (either one), exports, audit trail; each can ask the other for a
  missing right.
- Perimeter: a global permission only works with "all sections".
- No payroll module (decision of 06/11/2026): no `payroll.*` permissions.
- Settings and clients viewable **read-only** with `settings.view`.
- Error report: `timeclock.report_issue` for oneself, `timeclock.correction.request` for a technician of the perimeter.
- Full backups under `backups.manage`, separate from account management.
- "New employee": four roles and choice of the sections at creation.
- **Migration v4 → v5**: verified copy, roles converted (Yann → quality, Jérémie → director, other administrator →
  quality), individual rights and access requests renamed (no right lost), audit trail.
- Defects fixed: the director could not request a right; an "admin" value sent by an old screen or an old backup was
  silently ignored (now converted to "quality").

**Two-step leave circuit**
- Statuses: draft, waiting for the team lead's opinion, favourable opinion, unfavourable opinion, waiting for the final
  decision, approved, refused, cancelled. Every step is stored (who, when, from / to, comment) and traced.
- The team lead gives an opinion (comment mandatory if unfavourable or if he asks for a change) on the requests of the
  employees of his perimeter; he does not decide. The final decision belongs to the quality manager or the director
  (either one); a reason is mandatory for a refusal. The decider must be the signed-in person.
- Exception: deciding without the team lead's opinion needs a justification, kept and displayed. Requests of a team
  lead or a manager go directly to the final decision (never decided by oneself).
- Delegation: temporary right "Decide leave finally" granted through access requests (expires by itself).
- Draft editable then sent; cancellation by the requester before the decision (the request and its history are kept);
  the balance only moves on approval, open requests remaining a forecast.
- Request sheet: steps, team lead's opinion, **conflicts** with the other absences of the perimeter, actions by rights.
- Queue per profile (team lead: To review / Sent on / Decided; managers: To decide / With the team lead / Approved /
  Refused); calendar: open requests dashed, visible within the perimeter.
- Notifications at every step (team lead, managers, requester). Old "pending" requests → "waiting for the team lead's
  opinion".
- Defects fixed: the CSV leave import was still shown to technicians while importing nothing (regression of beta.3);
  a team lead would have given his opinion on the managers' leave; leave under review would have shown as approved in
  the calendar; notifications showed a code instead of the leave type.
- Tests made independent of the current date (register, timesheet).

**Remaining for this mission**: anomaly register (status, owner, resolution, filters), hours summary for accounting
(weekly, monthly, yearly, export, history of sendings), "control" and "director" dashboards, reports per period,
section, client and activity.

## 2.8.0-beta.4 — INTERMEDIATE version (06/11/2026)

**Team lead dashboard** (defect reported on 06/11/2026)
- The dashboard chose its view only from the "manage accounts" right: the team lead got the technician view (unusable
  "Clock" button, 39 h countdown, invitation to enter a hire date he can no longer change). The view now follows the
  permissions.
- **Team view** (team lead and managers), **limited to the sections** of the signed-in person: present / on break /
  off / on leave; "My technicians" table (live status, hours of the day, week done / goal, result, last entry, open
  error reports); "To look at" (leave waiting and error reports); team hours; overtime; activity; month summary per
  technician. The managers decide; the team lead follows (reminder shown) and has no "Decide" button.
- The team lead sees the error reports of his perimeter (read only).
- Disabled accounts are not shown.
- "Clock" button shown only for an account allowed to clock; message "hire date to be entered by a manager" for the
  others.

## 2.8.0-beta.3 — INTERMEDIATE version (06/11/2026)

**Clocking corrections reserved to the managers** (request of 06/11/2026)
- Technician: no more correction, addition, deletion or import; **"Report an error"** button on every day and every
  anomaly (description sent to the managers, follow-up "Pending / Corrected / Refused"). Live clocking (arrival, break,
  departure, Home) is unchanged.
- Team lead: consults and can report an error for a person of his sections; does not correct.
- Managers: correct from **Team → file → timesheet**; import a technician's register from his file (the import writes
  into the technician's data); every import is traced.
- **Day correction window**: a single form for arrival, departure, **meal** (start / end), activity, client, line and
  note; live summary "clocked − meal = day"; **mandatory reason**; name of the person concerned; reminder of the
  previous corrections.
- Saved as clean pieces (activity · meal · activity): an old meal **included** in the work (not deducted) is rebuilt
  correctly. Original values kept, a single audit event, employee notified, error reports of the day closed
  automatically.
- New explicit anomaly: "Meal included in the activity: it is not deducted from the day (to correct)".

**Security defects fixed** (checks added in the logic, not only in the screens)
- Reading another account's data temporarily replaced the signed-in user: rights checks and the author in the audit
  trail became those of the person consulted. Actor / subject separated.
- A new request accepted an "approved" status given by the caller: every request is now created "pending"; approved
  history (register import) is reserved to the managers.
- Shared clients could be created, changed or deleted by any account: reserved to the managers.
- Imports announced entries as imported even when they were refused: what is really saved is counted.

## 2.8.0-beta.2 — INTERMEDIATE version (06/11/2026)

**Clocking categories** (request of 05/11/2026): buttons **Work, Home, Meeting, Travel, Meal**, in that order.
- "Home" replaces the separate "Home work" button: same fixed day in one tap (7 h + meal, 35 h basis).
- "Lunch" becomes "Meal" (4 languages; Spanish agreements fixed).
- Break stays available through the Break / Resume button of the top card.
- "Other" is no longer offered; existing "Other" entries stay visible and correctable.
- The **Line** field is removed from the Clock screen only (kept in Clients, corrections, exports); the "move to another
  client" button now only compares the client.

## 2.8.0-beta.1 — INTERMEDIATE version (05/11/2026)

Delivered on request, before the end of the mission. Everything listed under "Done" is implemented and tested; the
"Still to do" part is **not** available yet.

### Done

**Foundations**
- `js/storage-adapter.js`: the only file accessing the browser storage (replaceable later by an API).
- Data schema **v4**. Automatic migration from v1, v2 and **v3 (2.7 data)**: safety copy **read back and compared**,
  migration to a new key (old data never rewritten), integrity check, report written to the audit trail.
- Device identifier (`deviceId`) and stable identifiers, for a future synchronisation (not developed).

**Roles, permissions, sections**
- `js/permissions.js`: central module, 20 permissions, default rights per role, permanent or temporary individual rights
  (expiry checked at every check, even if the app stayed closed), revocation.
- Checks **in the business logic** (`store.js`), not only by hiding buttons.
- Roles: technician, team lead, administrator. Role, sections, account status and clocking obligation are separate
  fields; no rule depends on a person's name.
- Reference accounts: Alexandre Machado (technician, South), Damien Morvan (technician, North) — clocking mandatory;
  Enrique Soler (team lead, North + South); Yann Lefloc'h (Quality Manager) and Jérémie Augé (Sales Manager France &
  CEO), administrators with identical rights, all sections. Clocking off by default for Enrique, Yann and Jérémie,
  can be turned on account by account.
- Safeguards: nobody grants himself rights nor approves his own request; nobody disables nor demotes himself; never
  zero active administrator. The two managers manage each other without blocking.
- North and South sections, can be created and renamed; assignments in each person's file.
- Menus and tabs computed from the permissions.

**Access requests**: mandatory reason, temporary or permanent, approval / refusal / request for details / other
justified period, "expired" and "revoked" statuses, notification of the requester and the managers.

**Audit trail**: every important action (sign-ins, accounts, roles, rights, access requests, settings, sections,
backups, imports, exports, migrations) with author, date, old and new value, reason. Screen with search by user,
period, action type and text; values shown in plain language; CSV and JSON export.

**Internal notifications**: bell with the number of unread items (computer and phone), list, mark as read.

**Backups**: **full** backup (every account) with manifest and checksum; **check on a copy** in memory, with no
writing; restore preceded by a verified safety copy; storage use measured, warning above 80 %, management of the
safety copies.

**Leave**: acquisition changed to **2.5 days per full month** (30 days a year).

**Home work** (information of 05/11/2026), renamed **Home** in beta.2: one tap records the day (home + meal);
**7 h maximum**, no night hours; day on the **35 h basis** (the week goal loses 0 h 48 per home work day); refused
if the day already holds other entries; declared directly, traced; every value editable (Time rules).

**Tests**: `tests/` folder in the project, single launcher `node tests/run-all.js` (1,941 checks at that version).

### Defects fixed during these steps
- Administrators received the right to clock by default (contrary to the decision of 05/11): fixed.
- Account sorting only knew two roles: fixed.
- A damaged backup (emptied content) passed the check: manifest and checksum added.
- The audit trail showed unreadable technical values: values translated.
- The Time rules screen still offered "25 days a year", a rule removed by schema v4 (change silently ignored): replaced
  by "2.5 days a month".
- A "Synchronisation" box suggested a synchronisation between devices: removed.
- The README claimed the app did not work by double-clicking `index.html`: wrong, checked and fixed.

### Still to do at that time (next steps of the mission)
1. Two-step leave validation — done in beta.5, simplified to a single decision in 3.0.
2. Leave counting and movement journal — counting rule settled in 3.1 (Monday → Friday).
3. Absence categories and half days — done in 3.0.
4. 39 h / 169 h engine: separate display of the monthly contractual time (169 h = 151.67 h + 17.33 h) and of the
   time actually clocked.
5. Clocking: additional checks (forgotten departure over several days, abnormal break, incomplete day).
6. Payroll preparation exports and documented adaptation layer.
7. Complete final documentation.

### Business parameters to confirm (HR / payroll) at that time
- Value of a credited day — settled in 3.0 (7.8 h, register "OK").
- Public holiday on a Saturday or Sunday — settled in 3.0 (not credited, register "OK").
- Travel time counted as working time (as in the register).
- Carry-over, acquisition period, rounding — period and carry-over settled in 3.0 (May → May, on request).
- Short breaks counted or not (rule, off by default).
