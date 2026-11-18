# Manual test scenarios — 4.7.1

To run in the interface, with the **five accounts**, to check that the rights are **really applied** (not only the
menus). Tick each line; note any difference with a screenshot. Labels are given as shown in the **English**
interface (language selector on the sign-in screen).

## Preparation

1. Open `index.html` by double-click in Chrome or Edge (nothing to install).
2. Settings → Backup: if data already exists, **export a full backup** before starting (signed in as Yann or Jérémie).
3. At the first sign-in of each account, choose a password (6 characters minimum) and write it down.

## A. Alexandre Machado — technician, South, mandatory clocking

| # | Action | Expected result | OK |
|---|---|---|---|
| A1 | Sign in | Menu: Dashboard, Clocking, Leave & absences, Reports, Settings. **No** Team | ☐ |
| A1b | First sign-in | Presentation in 7 steps; "Skip" closes it; it does not come back at the next sign-in | ☐ |
| A1c | Last step → Allow notifications, protected data, install (https address) | The browser asks; the state becomes "On" | ☐ |
| A1d | Profile → Quick sign-in: PIN 1234 | Refused (too simple); 2580 accepted with the current password | ☐ |
| A1e | Sign out, pick Alexandre | PIN screen; signed in at the 4th digit; "Use my password" works | ☐ |
| A1f | 5 wrong PINs | PIN removed, password asked | ☐ |
| A1g | Phone / laptop with fingerprint or Windows Hello (https): activate, sign out, "Use my fingerprint" | Signed in after the fingerprint | ☐ |
| A1h | Sign-in: type the password with the mouse on the on-screen keyboard (ABC, ⇧, 123, erase), then with the keyboard | Both work; Tab goes from the field to "Sign in" | ☐ |
| A2 | Type `#team` in the address bar | Sent back to the dashboard | ☐ |
| A3 | Clocking → arrival, wait 1 min, Break, Resume, Clock out | Correct status at each step; today's journal up to date; "Undo" banner with a steady 10 s countdown | ☐ |
| A3b | Activity card | Buttons exactly: Work, Home, Meeting, Travel, Meal; Client field, **no** Line field | ☐ |
| A4 | Home | Starts a timer like the other activities (rule "Fixed home day" off by default) | ☐ |
| A5 | (Yann turns "Fixed home day" on) Home on a day with no entry | Day 08:00–12:00 + meal + 13:00–16:00; Alexandre notified of the rule change | ☐ |
| A6 | Home a 2nd time the same day | Refused: "A day at home is already recorded today." | ☐ |
| A7 | Leave & absences → "+" | Request "Waiting for the final decision", shown dashed in the calendar | ☐ |
| A8 | Calendar | Sees only his own absences (rule "Leave calendar for technicians" = only their own) | ☐ |
| A8b | "+" → Save as draft, reopen it, change it, Send the request | Enrique, Yann and Jérémie notified | ☐ |
| A8c | Cancel a request not decided yet | Status "Cancelled", history kept | ☐ |
| A8d | A one-day request | Duration choice: full day / morning / afternoon (0.5 day) | ☐ |
| A8e | A request for tomorrow | Yellow notice-period banner; the deciders receive "late request" | ☐ |
| A9 | Settings | Tabs: Profile, My workspace, Preferences, Backup, Reference document. **No** Time rules, Audit trail, Rights | ☐ |
| A9b | My workspace → My tabs: drag Reports up by its handle, untick Leave & absences | Menu reordered; Dashboard and Settings cannot be unticked; `#leave` still opens | ☐ |
| A9c | My workspace → Menu position: right; Theme: dark | Menu on the right on a computer, bottom bar on a phone; dark theme | ☐ |
| A9d | Dashboard → Customise: drag a tile, make "My week" wider (+), hide a tile (eye), Done | Order, width and hidden tile kept; nothing else changes (hours, balance) | ☐ |
| A9e | Sign out, close the browser, reopen, sign in | Same menu, theme and dashboard as left | ☐ |
| A9f | Phone or tablet: Customise, drag a block by its handle with the finger | Block moved, the page does not scroll during the drag | ☐ |
| A9g | My workspace → Reset my presentation | Theme automatic, menu on the left, default tabs and dashboard | ☐ |
| A10 | Profile | Job title and section "Sud" shown; hire date cannot be changed | ☐ |
| A11 | Timesheet → open a day | **No** ✎ button, nor "Add", nor "Import"; "Report an error" button | ☐ |
| A12 | Report an error (e.g. "real departure 17:30") | Report sent; error reports card: Pending | ☐ |
| A13 | Settings → Backup → download a backup, open it in an editor, add a request with `"status": "approved"` and change a setting, then restore my settings | Only the setting changes; message "Settings restored (1). Ignored…"; **no leave added**, balance unchanged | ☐ |
| A14 | Same tab | No full backup nor full restore button | ☐ |

## B. Damien Morvan — technician, North

| # | Action | Expected result | OK |
|---|---|---|---|
| B1 | Sign in | Same menu as Alexandre | ☐ |
| B2 | Reports | Only his own hours; no employee choice | ☐ |
| B3 | Calendar | Does not show Alexandre's absences | ☐ |
| B4 | Dashboard (after A9d) | Damien's dashboard is the original one: arrangements are personal | ☐ |

## C. Enrique Soler — team lead, North + South, clocking not mandatory

| # | Action | Expected result | OK |
|---|---|---|---|
| C1 | Sign in | Menu: Dashboard, Validation, Leave & absences, Team, Reports, Settings. **No** Clocking | ☐ |
| C1a | Dashboard → "Team shown": Sud, then Alexandre, then whole team | Figures and lists follow; the names counted are written under the filter | ☐ |
| C1b | Dashboard | "My technicians": Alexandre (Sud) and Damien (Nord) with status, hours, week, result, reports; "To look at": leave to decide and reports; "Next week" grid | ☐ |
| C1c | (Yann removes the Sud section from Enrique) then Enrique's dashboard | Alexandre no longer shown | ☐ |
| C1d | Team, calendar, reports | Never shows Yann nor Jérémie | ☐ |
| C2 | Team → Alexandre's file | **Read-only** (greyed fields), no "New employee" button | ☐ |
| C3 | Settings | No Time rules, Sections, Audit trail tabs | ☐ |
| C4 | Settings → Rights & access → ask for a temporary right **without a reason** | Refused: reason mandatory | ☐ |
| C5 | Same request with a reason | Request sent; status Pending | ☐ |
| C6 | Validation → leave to decide → Alexandre's request | Approve / Reject buttons; flags shown (late, overlap, balance exceeded) | ☐ |
| C6b | Reject **without a comment** | Refused: comment mandatory | ☐ |
| C6c | Leave & absences | No "+" button; Balances tab with Alexandre and Damien | ☐ |
| C7 | Validation → a week sent by Alexandre → Validate and pass on | Status "validated by Enrique", Yann and Jérémie notified | ☐ |
| C8 | A locked week → Ask to unlock (with a reason) | Yann and Jérémie notified | ☐ |

## D. Yann Lefloc'h — Quality Manager, administrator

| # | Action | Expected result | OK |
|---|---|---|---|
| D1 | Sign in | Bell: notifications (Enrique's access request…); clicking a message opens the page concerned | ☐ |
| D2 | Rights & access → grant Enrique's request with a shorter period, **without a comment** | Refused: comment mandatory | ☐ |
| D3 | Same with a comment | Approved; Enrique notified; the right appears in his file with its end date | ☐ |
| D4 | Team → Jérémie's file: change his job title, disable him, enable him | Everything works (no blocking between managers) | ☐ |
| D5 | His own file: change his role or disable himself | Impossible | ☐ |
| D6 | Team → Enrique's file → grant "Clock own hours" | Enrique sees the Clocking menu at his next sign-in | ☐ |
| D7 | Settings → Sections: create "Centre", **Edit** it: tick Damien, Validate | Shown in Damien's file; "Delete" disabled while someone is attached | ☐ |
| D7b | Sections: Edit "Centre", untick Damien, Validate, then Delete | Section removed; "Section deleted" in the audit trail | ☐ |
| D8 | Audit trail: filter by user "Enrique", by type "Access requests", by period | Matching rows; old / new values readable; reason shown | ☐ |
| D9 | Audit trail → CSV | File downloaded; an "Export" event appears in the audit trail | ☐ |
| D10 | Backup → export the full backup, then check a backup with this file | The check reports the file as restorable with nothing missing; current data unchanged | ☐ |
| D11 | Open the backup file in an editor, change a figure, then check it | "Checksum" anomaly detected | ☐ |
| D12 | Backup → storage space | Percentage shown; list of safety copies | ☐ |
| D12b | Full backup → restore a full backup with a healthy file | **Preview** (current / file / after counters, accounts, rules, approved leave) then confirmation; refuse the confirmation | ☐ |
| D12c | Same with a file where an "approved" request without a decider was added | "Refused data (1)"; **no confirmation** offered; "Restore refused" event in the audit trail | ☐ |
| D12d | Restore the healthy file after a change | Data replaced; safety copy named in the message; "Backup restored" event (author, result) | ☐ |
| D13 | Bell | Notification of Alexandre's error report (A12) | ☐ |
| D14 | Team → Alexandre's file → timesheet → reported day → ✎ | A single window: arrival, departure, meal, activity; summary "clocked − meal = day" | ☐ |
| D15 | Save **without a reason** | Refused: reason mandatory | ☐ |
| D16 | With a reason | Day corrected (activity · meal · activity); report "Corrected"; Alexandre notified; audit trail: before / after / reason | ☐ |
| D17 | An old day with the meal included in the work | "To check": meal included in the activity, not deducted; after correction, the meal is deducted | ☐ |
| D18 | Alexandre's file → import the Excel register | Imported into **Alexandre's** data; "Import" event in the audit trail | ☐ |
| D19 | Time rules → **Edit the rules** → change a rule (e.g. notice period for 2 to 5 days: 7 → 10) → **Validate** | Message "1 change saved"; audit trail shows the rule by its name, 7 → 10; the technicians receive "changed the team rules: … 7 → 10" | ☐ |
| D19b | Time rules → Edit → change → Cancel | Nothing changed | ☐ |
| D20 | Reports of a technician hired in the year (e.g. 04/05) | Nothing counted before the hire date (no credited holiday, no goal); note "Hours counted from the hire date" | ☐ |

## E. Jérémie Augé — Sales Manager France & CEO, administrator

| # | Action | Expected result | OK |
|---|---|---|---|
| E1 | Sign in | Profile: "Responsable Commercial France & PDG"; Time rules editable (Edit / Validate), corrections, backups: same rights as Yann (4.1.6) | ☐ |
| E2 | Yann's file: reset his password | Yann must choose a new one at his next sign-in | ☐ |
| E3 | Rights & access: revoke the right granted to Enrique (with a reason) | Status "Revoked"; Enrique notified; the right disappears | ☐ |
| E4 | Validation → a week validated by Enrique → Lock | Locked; the flow shows who decided | ☐ |
| E5 | Leave → To decide → a request of Alexandre → Approve | Approved; Alexandre notified; balance updated | ☐ |
| E5b | Reject a request **without a reason** | Refused: reason mandatory | ☐ |
| E6 | Preferences → My absence (today's dates), then Enrique validates a week | The team lead's validation locks the week directly; Jérémie informed | ☐ |

## F. Cross-checks

| # | Action | Expected result | OK |
|---|---|---|---|
| F1 | Change the language (FR, EN, ES, DE) on every screen | No missing text, no "{variable}" visible | ☐ |
| F2 | Close the browser, reopen `index.html` | Data kept; sign-in asked again | ☐ |
| F3 | Phone (when served by a web server) | Dark top bar, tabs at the bottom, bell visible | ☐ |
| F4 | Leave no action for 15 min | Back to the sign-in screen | ☐ |
| F5 | Calendar with several absences | One band per person, initials badge, background = type, holiday name next to the day; no leave drawn on Saturday, Sunday or a holiday | ☐ |

## G. Forgotten password (4.3)

| # | Action | Expected result | OK |
|---|---|---|---|
| G1 | Sign-in → Alexandre → **Forgot your password?** | Two options; request sent to Enrique, Yann, Jérémie; e-mail / SMS buttons greyed (server) | ☐ |
| G2 | **Send the request**, then open it again | "Request sent on …"; no second request | ☐ |
| G3 | Sign in as Enrique → bell | "Alexandre … asks to unlock the account"; click → Alexandre's file with the banner | ☐ |
| G4 | Enrique → **Reset the password** | Message; Yann and Jérémie notified; Alexandre chooses a new password at sign-in, then sees "reset by Enrique Soler" | ☐ |
| G5 | Enrique opens Yann's or Jérémie's file | Not listed (never upwards); no reset possible | ☐ |
| G6 | Settings → Profile → e-mail "abc" | "Invalid e-mail address"; a valid address is saved | ☐ |

## H. Reports and dashboard (4.4)

| # | Action | Expected result | OK |
|---|---|---|---|
| H1 | Reports → **Export** | Window: PDF / Excel, parts, language; nothing exported before "Export" | ☐ |
| H2 | PDF, all parts, "with the detail of the weeks" | Logo, technician band, indicators, hours to pay, time off, chart; months followed by their weeks; total in burgundy; page n / N | ☐ |
| H3 | Same in **Español** | Document in Spanish; the app stays in French | ☐ |
| H4 | Excel with the weeks | One sheet per part; weeks folded under each month with "+" | ☐ |
| H5 | Yann: whole team, "Team table only" | One page: one line per technician + total | ☐ |
| H6 | Alexandre's dashboard after clocking | "Clocking saved at hh:mm", badge of the day, My calendar with a dot on clocked days; "Request leave" opens the request | ☐ |
| H7 | User menu (name at the top right) → **Mode sombre**, then **Mode clair** | Whole app switches; the choice stays after closing / reopening | ☐ |
| H8 | Report with the weeks, for a technician whose register was imported | Imported weeks show "Import Excel" next to their state | ☐ |

## I. Annual target (4.5)

| # | Action | Expected result | OK |
|---|---|---|---|
| I1 | Yann → Team → Alexandre: hire date 04/05/2026, no contract | "Target 2026: 1 344 h 36 (calendar-day prorata)" | ☐ |
| I2 | Add a contract change (35 h from 01/07) | Hours / month 151 h 40; target lowered from July | ☐ |
| I3 | Leaving date 30/06 | Target stops on 30/06 | ☐ |
| I4 | Report January → November, PDF | Band: valued / target, % done, target at the end, ahead / behind, remaining; recovery balance | ☐ |
| I5 | Alexandre's dashboard | Block "Annual target" = the report figures | ☐ |
| I6 | Clock → Training | Training clocked like an activity, counted as working time | ☐ |

## J. 4.5.1 — Excel register import with pre-validation

1. As Yann: Team → Alexandre → Timesheet → Import → choose the register file.
2. Expected: the sheet list (if several sheets), then "Import preview": period, 4 boxes, table month by month, days to
   check grouped by reason. The timesheet is unchanged.
3. Change the sheet in the list: the preview is recomputed. "Cancel": nothing is imported.
4. "Validate the import": the green sentence "Last Excel import: … by Yann Lefloc'h" appears and stays after reloading.
5. Import the same file again: "Nothing new to import", the "Validate the import" button is disabled.

## K. 4.6.0 — "Clockings" page and steering explanations

1. As Yann (or Enrique, Jérémie): Team → "Clockings" (4.7: no separate menu entry); as Alexandre (technician): absent.
2. Week view: one row per technician, 7 day cells, total, result, state of the week. A running clocking is framed in blue.
3. Click a day: its segments appear below the table; "Open the full timesheet" opens the file on the timesheet tab.
4. "Month": one cell per week; a click opens that week day by day. Section filter: only the technicians of the section.
5. Team → a technician: the file opens on "Timesheet"; "Profile and contract" shows the form, the contract and the rights.
6. As Jérémie, dashboard: click a "Steering" tile — its detail by week and by technician opens, the total equals the
   figure; click its ⓘ — the explanation replaces the detail; a second click closes it.

## L. 4.7.0 — Navigation, state of the app and network

1. Yann: menu Home, To validate, Leave, Team, Reports, then Settings apart. Alexandre: Home, Clock in, Leave, My hours, Settings.
2. To validate: tabs Weeks, Leave, Error reports, History, with a counter when something waits. A leave decision from the
   Leave tab works as before (detail sheet).
3. Team opens on Clockings; Employees shows the list; a file opens on the timesheet, "Profile and contract" next to it.
4. Leave: Alexandre sees "My requests and balances" first; Yann sees Calendar and Balances (no requests to decide here).
5. Settings: 4 groups (My account, Company, Data, Help) and their sub-tabs; Help → Reading the report.
6. Under "My Time Keeper": "Local mode" and "Online" (Wi-Fi / mobile network on a phone that tells it); switch the
   network off: "Offline" in red. On a phone: two dots in the top bar, the gear opens Settings.
7. An old link `#leave/requests` opens To validate → Leave; `#clockings` opens Team → Clockings.

## M. 4.7.1 — Moving dashboard blocks, technician screens

1. Alexandre → Home → Personalise: drag "My calendar" over "Validation of the previous week", wiggle the pointer: the
   blocks swap once, without jumping back and forth. Release: the order is kept after reloading.
2. Out of Personalise: no card stretched with an empty bottom; the holes under short blocks are filled.
3. Clock in: the star is aligned with the client list; favourite / recent clients under the list.
4. Leave → My requests and balances: the current week card shows the figure on one line, "still to work" under it.
5. My hours → This year: the months start at the hiring month (May for Alexandre).

