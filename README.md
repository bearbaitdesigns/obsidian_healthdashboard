# Health Dashboard for Obsidian

Seven health trackers in one plugin: period, migraine, doctor visits, blood pressure, sickness and general health, medications, and A1C. One **Health dashboard** shows everything together, and each tracker also has its own dashboard.

> **Not medical advice.** Health Dashboard is a personal record-keeping tool, not a medical device. It doesn't diagnose or treat anything.

## Install with BRAT (recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs plugins straight from GitHub and keeps them up to date.

1. Install and enable **BRAT** from **Settings → Community plugins → Browse**.
2. Run **BRAT: Add a beta plugin for testing** from the command palette (or open **Settings → BRAT → Add beta plugin**).
3. Enter `bearbaitdesigns/obsidian_healthdashboard` and click **Add plugin**.
4. In **Settings → Community plugins**, enable **Health Dashboard**.

BRAT checks for new versions when Obsidian starts, or run **BRAT: Check for updates to all beta plugins**.

## Install by hand

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/bearbaitdesigns/obsidian_healthdashboard/releases/latest).
2. In your vault, create `.obsidian/plugins/health-dashboard/` and put the three files in it.
3. In **Settings → Community plugins**, click refresh and enable **Health Dashboard**.

## Moving from the separate Period Tracker and Migraine Tracker plugins

**Turn off** the separate *Period Tracker* and *Migraine Tracker* plugins in **Settings → Community plugins** before enabling Health Dashboard. You can delete their folders afterwards; your notes are not inside them.

Your existing notes keep working as they are. Period logs stay in `Period Tracker/Logs`, and migraine episodes are still found by `entry: migraine`. The first time it loads, Health Dashboard copies your settings from the old plugins: lists, folders, pain scale and so on. Command IDs are unchanged, so any hotkeys you set still work.

If one of the old plugins is still turned on, Health Dashboard pauses that half and shows a notice instead of clashing with it. Turn the old plugin off, then turn Health Dashboard off and on again.

## The Health dashboard

Open it with the **heart-pulse ribbon icon** (the only Health Dashboard icon in the ribbon) or **Health Dashboard: Open dashboard**. It has one tab per tracker plus the Overview:

| Tab | What it shows |
|---|---|
| **Overview** | Quick log buttons, an ongoing-migraine banner, a summary card for each tracker, a **shared calendar** and **Migraines and your cycle**. |
| **Period** | The full Period dashboard. |
| **Migraine** | The full Migraine dashboard. |
| **Visits** | The full Doctor visits dashboard. |
| **Blood pressure** | The full Blood pressure dashboard. |
| **Sickness** | The full Sickness and general health dashboard. |
| **Medications** | The full Medications dashboard. |
| **A1C** | The full A1C dashboard. |

**Shared calendar.** Period days are shaded by flow, and predicted days have a dashed border. A green bar marks migraine days; darker means more pain. A teal dot marks doctor visits, and an orange bar at the top marks sick days. Click any day to log or edit an entry for that day.

**Migraines and your cycle.** A chart of when migraines start relative to day 1 of your period, from 10 days before to 10 days after. The window from 2 days before to the 3rd day of bleeding is shaded. It shows:
- how many migraines started in that window, next to the share you would expect by chance (window days ÷ your average cycle)
- how many periods had a migraine start in that window

If migraines started in the window in at least 2 of 3 cycles (with 3 or more cycles logged), a note says that this is a pattern worth mentioning to a doctor. This is a pattern view, not a diagnosis.

**Pain scale.** Period and migraine pain use the same words: 0 = No pain, 1 = Very mild, 2 = Mild, 3 = Moderate, 4 = Severe, 5 = Very severe. If the migraine tracker is set to a 0–10 scale, each word covers two points (1–2 very mild, 3–4 mild, and so on). The Sickness tracker's "how bad" is the overall illness, not a pain score, so it keeps Mild / Moderate / Severe.

**Migraines with aura.** An episode counts as "with aura" when you logged the symptom **Visual aura** (or any symptom with "aura" in its name), or when its type is "Migraine with aura". The Migraine dashboard shows this in the **With aura** tile, and the PDF report shows it in the summary.

**Pattern charts show their numbers.** Every bar shows the number its percentage comes from:
- *Symptoms, causes, time of day and similar:* "4 of 5 · 80%" means 4 of the 5 episodes in the period.
- *Migraine medications:* the bar shows how many episodes used it. The number is "helped of rated uses", for example "1 of 1 rated · 100%" means the effect was rated once and it helped that once. Hover for the full detail. Uses marked "Not sure" or left blank aren't counted as rated.
- *Sickness medications and remedies:* "3 used · helped 1 of 3".

**Same buttons on every dashboard.** **CSV** (where there is one) and **PDF report** sit at the right end of the tab row, in the same place as **Health report (PDF)** on the Overview. Each tracker's own header keeps the period menu (where there is one) and its logging buttons, in the accent colour.

The dashboard remembers the last tab you used. You can change that, and choose which trackers are on and which appear on the Overview, under **Settings → Health Dashboard** (see *Choosing dashboards*).

## Help, sources and the disclaimer

**? button.** The **?** next to the Health dashboard title explains the tab you're on:
- what each tile and chart shows
- how each figure is calculated
- why each boundary was chosen
- the sources, with links

Where guidelines differ and the dashboard had to pick one, a highlighted box says which one you're using, with a button that opens the right settings.

| Dashboard | Choice you can change | Options |
|---|---|---|
| Period | Reference ranges (Period settings) | US (NIH and CDC): cycles 21–35 days, periods over 7 days flagged. FIGO 2018: 24–38 days, over 8 days. Or your own numbers |
| Migraine | Acute-medication alert (Migraine settings) | Any number of days in 30. ICHD-3 uses 10 for triptans and combination painkillers such as Excedrin, and 15 for simple painkillers only. Pain scale 0–5 or 0–10 |
| Blood pressure | Guideline (Blood pressure settings) | ESC 2024 home or clinic readings, ACC/AHA 2025, or your doctor's target |
| A1C | Ranges (A1C settings) | ADA: prediabetes from 5.7% (39 mmol/mol). NICE (UK): high risk from 6.0% (42 mmol/mol). Or your doctor's target |
| Medications | Refill warning (Medications settings) | 1–21 days |

The "Migraines and your cycle" window (day −2 to day +3, and the two-out-of-three-cycles rule) comes from the international headache criteria. It has no alternative standard, so there's no setting for it.

**Disclaimer.** The Overview shows a short note: Health Dashboard is for your own records, not medical advice. Hide it with ✕, or turn it back on with **Settings → Health Dashboard → Overview → Show the disclaimer**. Every PDF report ends with the disclaimer.

**Appendix in PDF reports.** Each doctor report ends with **Appendix: how this report was calculated**. It covers:
- the methods and boundaries behind the figures
- the settings used for that report
- numbered references

The combined Health report has a single appendix at the end, grouped by dashboard, with one reference list. Doctor visits and the medication list have no calculations to explain, so they end with the disclaimer only.

**Expand a chart.** Every bar or line chart has an expand button in its top-right corner. It opens the chart in a large window so it's easier to read.

## Your name on reports

Enter your name once under **Settings → Health Dashboard → Your name** (at the top). It's printed on every PDF made for your doctor:
- the period and migraine reports
- the blood pressure and A1C reports
- the printed medication list

Each report dialog shows the name prefilled. You can change it there for that one report without changing the saved name. If you had already set a name in one of the trackers, it's used automatically.

## Reports for your doctor

Every dashboard can make a PDF for your doctor:

| Dashboard | Report | How |
|---|---|---|
| Overview | **Health report**: everything in one PDF (see below), including the **Migraines and your cycle** chart when it's shown on the Overview | **Health report (PDF)** button next to the tabs on the Overview |
| Period | Cycle summary, patterns to discuss, cycle-length chart, period history, symptoms and medication, daily log | **PDF report** on the Period dashboard |
| Migraine | Summary, headache days per month, peak pain, pain calendar, medications, patterns, episode log | **Doctor report** on the Migraine dashboard |
| Doctor visits | Upcoming visits, follow-ups, visit history, care team | **Doctor report** on the Visits dashboard |
| Blood pressure | Averages, chart, categories, all readings | **Doctor report** |
| Sickness | Times sick, what helped, every episode | **Doctor report** |
| Medications | Printable medication list with allergies | **Print medication list** |
| A1C | Results, trend, ranges | **Doctor report** |

All reports share one layout: a coloured title bar with your name and the period, summary figures in boxes, headed sections with charts and tables, and page numbers in the footer. Each report dialog has **Include general notes**. The period and migraine reports also have an option to include the ones without an exact date (see below).

### One health report from all dashboards

**Health report (PDF)** on the Overview, or **Health Dashboard: Create health report**, makes a single PDF:
1. A **Health summary** comes first. It has a contents list with page numbers and the key figures from each tracker. It also includes your current medications, your allergies, your questions for the doctor and your general notes.
2. Then the full report from each tracker, in the order you choose. In the dialog, drag the trackers into order and untick any you want to leave out. Your choice is remembered for next time.

You also pick the period (3, 6 or 12 months, all data, or custom dates). You can include detailed logs, records without an exact date and general notes. The PDF has bookmarks so your doctor can jump to each part. It's saved in `Health Notes/Reports/`.

## General notes

Every dashboard ends with a **Notes** card for anything that isn't part of a log entry, such as a new job, travel, stress, something the doctor said, or a question to ask. The Overview has a general **Notes** block you can drag like the other cards. **Add note** asks for a date, an optional title and the note. You can also change which tracker a note belongs to. The four most recent notes are shown, with **Show all** for the rest.

Notes are saved in `Health Notes/Notes/<tracker>/` (`entry: health-note`). Change the folder under **Settings → Health Dashboard → Notes and reports folder**.

## Periods and migraines without an exact date

Forgot to log a period or a migraine and can't remember the date? Use **Add missed period** or **Add missed migraine** at the bottom of the Period or Migraine dashboard. The commands **Log a missed period / migraine (no exact date)** do the same. You can give:
- **when**: a month, a range of dates, or "I'm not sure" with a rough description such as "last winter"
- **how many** (for example, 2 migraines that month)
- what you remember: type and how bad for migraines, flow and length for periods
- notes

These records are **never counted** in statistics, averages, predictions, charts or the calendar. They're listed in their own card on the dashboard. If you choose, they appear in the PDF reports as a separate, clearly labelled section. The health summary mentions them too, for example "plus 3 migraines logged without an exact date". They're saved in `Health Notes/Missed records/` (`entry: missed-event`).

## Choosing dashboards

Go to **Settings → Health Dashboard**.

**Dashboards** has an on/off switch for each of the seven trackers. Changes take effect immediately, without restarting Obsidian. When a tracker is off:
- its tab disappears from the Health dashboard, and its standalone dashboard closes
- its commands, status bar item and settings tab are removed, and its options leave the Selectors list
- your notes stay exactly where they are, and everything comes back when you turn it on again

**Overview** chooses which trackers appear on the Overview tab. A tracker can stay on, with its own tab, while being left off the Overview. For each tracker shown on the Overview you get:
- its summary card
- its quick log buttons
- its markings on the shared calendar: period shading, migraine bars, visit dots

"Migraines and your cycle" appears only when both period and migraine tracking are shown on the Overview. If you hide everything, the Overview tells you where to turn things back on.

**Arranging the dashboard.** Everything is arranged by dragging on the Health dashboard itself:
- **Tabs:** drag any tracker tab left or right. Overview always stays first. A normal click still opens the tab.
- **Overview:** the summary cards, the calendar, the **Migraines and your cycle** chart and your notes are free-form blocks. Each one can sit at any spot and be any width; there are no fixed columns or rows.
  - **Move:** drag a block anywhere. Start the drag anywhere on it except its buttons and calendar days. A dashed outline shows where it will land. Blocks snap lightly to an 8-pixel grid and to the edges of nearby blocks, so things line up without effort.
  - **Resize:** drag the small handle in a block's bottom-right corner to change its width and height. A block never gets shorter than its contents.
  - **No overlaps:** if you drop or grow a block over another, the one underneath moves down out of the way.
  - **Tidy up** (above the board) packs every block neatly from the top, keeping the sizes you chose. **Reset layout** puts everything back in the default columns.
  - The quick log buttons follow the blocks from top to bottom, left to right.
  - **Narrow screens** (phones, or a narrow pane under 600 pixels) stack the blocks in one column in the same order. There you can drag them up and down to reorder. Your free layout comes back when the pane is wide again.
  - Prefer columns? Set **Overview layout** in settings to **Grid (columns)**. Blocks then snap into columns and you drag them into an order, as before.
- **Touch screens:** press and hold a tab or block for a moment, then drag. A quick swipe still scrolls the page. The resize handle works straight away.

The new layout is saved straight away, in pixels. The tab order and the Overview layout are separate, so A1C can be your first tab while blood pressure sits at the top of the Overview. Trackers that are turned off or hidden keep their spot for when you bring them back; a newly shown block goes into the first free space.

**Calendar size.** The button in the calendar's top-right corner switches it between two columns' width and the full width, with bigger days that are easier to tap. The same switch is in settings as **Calendar takes the full width**. In the free layout you can also resize it to any width from its corner.

**Starting over.** In settings, **Tab order → Reset to default order** puts the tabs back, and **Reset the Overview layout** forgets where you placed and how you sized the blocks. **Overview order** has **Use the tab order** and **Reset to default order**; both put the calendar and chart after the cards.

"Open the dashboard on" only lists tabs for trackers that are on, in your tab order. If the remembered tab belongs to a tracker you turned off, the dashboard opens on the Overview instead.

## Doctor visits

Open it from the **Visits** tab or **Doctor Visits: Open dashboard**. Log a visit with **Log visit** or **Doctor Visits: Log a visit**.

| Section | Fields |
|---|---|
| When | Date, time (optional), type of visit (in person, video, phone) |
| Who | Doctor or clinician, clinic or hospital, specialty. Picking a doctor you've seen before fills in their clinic and specialty. |
| Why | Reason for visit, what it's related to (migraine, period, general health…), questions to ask |
| What happened | What was discussed, diagnosis or results, next steps and advice, tests or referrals ordered, medication changes (one per line) |
| Follow-up | Follow-up date (with 2-week to 6-month shortcuts) and cost (optional) |

You can log an upcoming visit ahead of time with your questions, then add notes afterwards with the pencil button.

The dashboard shows:
- **Tiles:** next visit, last visit, visits in the last 12 months, and follow-ups to book (highlighted when overdue).
- **Upcoming visits:** each one shows your questions to ask and a **Since your last visit** summary, with one block per dashboard in your tab order: periods and cycle lengths; migraines, migraine days, average peak pain, aura, acute-medication days and the most common trigger; average blood pressure with morning and evening; sickness; medications started or stopped; and your latest A1C. A dashboard with nothing new says so. It's ready to bring up during the appointment. The Doctor visits PDF report includes the same summary as a **Since the last visit** section (turn it off with **Include “Since your last visit”** in the report options).
- **Follow-ups to book:** follow-up dates that no later visit with the same doctor (or clinic) has covered yet. **Add visit** opens a new visit with the doctor, clinic and reason already filled in.
- **Visit history:** grouped by year, with search across all notes, results and medications, and filters by year, by doctor or clinic and by topic. Switch between three views with the buttons beside the heading: **Cards** (the default, full notes), **Grid** (compact tiles) and **List** (a table). Click a tile or row to edit the visit; the note icon opens the note. Your choice of view is remembered.
- **Your care team:** each doctor with their clinic, specialty, number of visits, and last and next visit.
- **CSV export** of all visits.

The next visit appears in the status bar when it's within 14 days (you can turn this off in **Settings → Doctor Visits**).

Each visit is a note in `Doctor Visits/`, for example `2026-11-20 Dr. Sigrún Jónsdóttir.md`, with the details in its properties:

```yaml
---
entry: doctor-visit
date: 2026-11-20
time: "14:30"
doctor: Dr. Sigrún Jónsdóttir
clinic: Heilsugæslan Miðbæ
specialty: General practice
visit_type: Video
reason: Follow-up
related: [Migraine]
questions: Is naproxen working?
discussed: ...
outcome: ...
next_steps: ...
tests: [Blood test]
med_changes: [Start naproxen 500 mg]
follow_up: 2027-02-20
tags: [doctor-visit]
---
```

Empty fields are left out of the note. You can write anything you like below the properties.

## Blood pressure

Open it from the **Blood pressure** tab or **Blood Pressure: Open dashboard**. Log readings with **Log reading**.

**Logging a reading.** Enter systolic, diastolic and pulse (optional), plus the date and time, arm and position. You can also note anything that might affect the reading (caffeine, exercise, stress…) and blood pressure medication taken that day. Medications on your Medications list are offered automatically. The category appears as you type. **Save and add another** keeps the arm, position and time (plus one minute) for a second reading, since a common home routine is two readings a minute apart, morning and evening.

**Guideline and target.** Under **Settings → Blood Pressure → Guidelines and target**:
- **Guideline** chooses how readings are labelled:
  - **ESC 2024 (European), home readings** (the default): non-elevated below 120/70, elevated 120–134 or 70–84, hypertension 135/85 or higher
  - **ESC 2024 (European), clinic readings**: hypertension starts at 140/90
  - **ACC/AHA 2025 (American)**: normal below 120/80, elevated 120–129, stage 1 130–139 or 80–89, stage 2 140/90 or higher
- **Use my doctor's target**: turn this on and enter the systolic and diastolic target your doctor gave you (for example 130/80). "Below target" on the dashboard and in the report then uses your target, the chart shows it as a green dashed line, and the report says the target was set by your doctor. The guideline still labels each reading. Turn the switch off to go back to the guideline's threshold.

Any reading of 180/120 or higher shows as **Very high**, whatever the settings, with advice to re-measure and to get emergency care if it stays that high or you have symptoms.

**Dashboard:**
- **Tiles:** latest reading, average, morning and evening averages, pulse, and % below target.
- **Charts:** a daily-average chart (systolic, diastolic, pulse) with guideline lines, a readings-by-category breakdown, and time-of-day averages with your highest and lowest readings.
- **Readings table** with edit buttons, a period selector (7 days to all time), and CSV export.

**Doctor report (PDF).** Click **Doctor report** or run **Blood Pressure: Create PDF report for doctor**. Choose a period (30 days to all data, or custom dates), and optionally add questions. It includes:
- summary figures, including variability
- a list of any very high readings
- a daily-average chart and the category breakdown
- weekly averages, morning against evening
- your current medications, your questions, and every reading

It's saved to `Blood Pressure/Reports/` and opens in Obsidian for printing.

Each reading is a note in `Blood Pressure/Readings/` with `entry: bp-reading`, `systolic`, `diastolic`, `pulse` and so on.

## Sickness and general health

Open it from the **Sickness** tab or **Sickness Tracker: Open dashboard**.

**Log sickness** records:
- when it started and when you recovered (leave the recovery date empty while you're still sick)
- the type (cold, flu, COVID-19, stomach bug…) and how bad it was (mild, moderate or severe)
- symptoms and your highest temperature (°C or °F, set in settings)
- medications and remedies, and **which of them helped**
- whether you saw a doctor, days off work or school, a diagnosis or test result, and notes

**Dashboard:**
- **Status and tiles:** a "sick right now" banner with an **I'm better** button, plus tiles for times sick, sick days, average length, days missed and the most common type.
- **Calendar:** sick days are shaded by severity.
- **Charts:** sick days per month, and breakdowns of types, symptoms, medications and remedies with how often each helped.
- **Episode table** for the chosen period.

While you're sick, the status bar shows the current day of the illness.

Notes go in `Health Log/Sickness/` (`entry: illness`).

## Medications

Open it from the **Medications** tab or **Medications: Open dashboard**.

**Add medication** records:
- name and strength, form (tablet, capsule, liquid…), and type (prescription, over the counter, supplement)
- what it's for, the dose, how often, the time of day, and instructions (for example "with food")
- who prescribed it (doctors from your visits are suggested) and the pharmacy
- start date, next refill date, side effects and notes

**Dashboard:**
- **Tiles:** current medications, refills due, and medications started or stopped in the last 90 days.
- **Refills due:** a **Refilled…** button sets the next date.
- **Daily schedule:** columns for morning, midday, evening and bedtime.
- **Medication cards:** scheduled and as-needed medicines, with search.
- **Past medications:** when you took each one, for how long, and why you stopped. You can restart any of them with one click.

**Stop** a medication with the stop button. It asks for the last day and the reason, and the medication moves to your history; nothing is deleted.

**Print medication list** creates a PDF to bring to appointments. It includes your allergies (set in **Settings → Medications**), regular and as-needed medicines with how to take them, medicines stopped in the last 12 months and why, and side effects. The status bar reminds you when a refill is due.

Each medication is a note in `Medications/` with `entry: medication`.

**Your medications in the other trackers.** Every medication you currently take, as listed on the Medications dashboard, is offered automatically wherever another tracker asks about medication. It's listed first, before that tracker's own list:
- **Period:** the medication chips in the log window
- **Migraine:** the medication name suggestions. Picking one fills in the dose from its strength if the dose is empty.
- **Blood pressure:** "medication taken today"
- **A1C:** "medications at the time"
- **Sickness:** the medications list
- **Doctor visits:** under "Medication changes", tap a medication to start a line for it

The list updates as you add or stop medications. Stopped medications are no longer offered, but entries that already mention them keep them. Medications chosen this way aren't copied into the other trackers' own lists, so Selectors stays tidy. If you turn the Medications tracker off, each tracker simply uses its own list.

**Working together:**
- Doctors from your visits are suggested as prescribers.
- The **Since your last visit** summary on upcoming doctor visits now also covers your average blood pressure (morning and evening), sickness, and medications started or stopped.



## A1C

Open it from the **A1C** tab or **A1C: Open dashboard**. A1C (HbA1c) reflects your average blood sugar over the past 2–3 months.

**Log result** records:
- the date and the A1C value, entered as % or mmol/mol (switch with one tap; the other unit is calculated)
- the type of test (lab blood test, finger-prick at clinic, home kit), the lab or clinic, and who ordered it (doctors from your visits are suggested)
- fasting glucose (optional) and the medications you were taking (from your Medications list)
- notes, for example anything that can affect A1C, such as recent illness, anaemia, pregnancy or blood loss

As you type, it shows the range, the value in both units, and your **estimated average glucose**.

**Dashboard:**
- **Tiles:** latest result and range, change since the previous test, estimated average glucose, your target (if set), when the next test is due, and tests in the last 12 months.
- **A1C over time** chart with the 5.7% and 6.5% lines, shaded prediabetes and diabetes ranges, and your target as a green dashed line.
- **All results** table: both units, the change from the test before, estimated average glucose, test type, lab and notes.
- A banner and a status-bar reminder when the next test is due or overdue.

**Ranges** follow the American Diabetes Association Standards of Care:
- below 5.7% (39 mmol/mol): normal
- 5.7–6.4% (39–47 mmol/mol): prediabetes
- 6.5% (48 mmol/mol) or higher: diabetes range

A single result is not a diagnosis. Estimated average glucose uses the ADAG formula: 28.7 × A1C − 46.7 mg/dL.

**Settings** (**Settings → A1C**):
- show A1C as %, mmol/mol, or both
- the glucose unit (mmol/L or mg/dL)
- **Use my doctor's target**, for example 7%
- how often you're tested (3, 4, 6 or 12 months), which drives the "next test" reminder
- the status bar reminder

**Doctor report (PDF).** Click **Doctor report** or run **A1C: Create PDF report for doctor**, and choose the period (all data by default). It includes:
- summary figures: latest result in both units, change over the period, estimated average glucose, lowest and highest, results below your target, and the change since the previous test
- the range note and the trend chart
- the results table with ranges, test details and notes
- your current medications and your questions

It's saved to `A1C/Reports/`.

Each result is a note in `A1C/` with `entry: a1c-result`, `a1c_percent` and `a1c_mmol_mol`.

## Customizing selectors

To change the options you pick from when logging, go to **Settings → Health Dashboard → Selectors**. Each list opens to an editor.

| Tracker | Lists |
|---|---|
| Period | Symptoms, Medications, Flow level names and Pain level names (renaming only) |
| Migraine | Migraine types, Medications, Symptoms, Possible causes / triggers, Relief methods, Headache locations, Where attacks happen, Time of day it started, Time of day it ended |
| Doctor visits | Doctors and clinicians, Clinics and practices, Specialties, Reasons for visit, Visit types, Related to (topics), Tests and referrals |
| Blood pressure | Arms, Positions, Circumstances, Blood pressure medications |
| Sickness | Types of sickness, Symptoms, Medications, Remedies (renaming also updates "what helped") |
| Medications | Forms, Types, How often, Times of day, What it's for, Prescribers, Pharmacies, Reasons for stopping |
| A1C | Types of test, Labs and clinics |

In each list you can:
- **Add** an option (type it and press Enter).
- **Rename** an option by editing its name. If notes already use it, you're asked whether to change those notes too. For migraine medications, only the name changes; dose, date and "helped" stay the same. Renaming an option to the name of another option merges the two.
- **Reorder** with the arrows, or use **Sort A–Z**. The order is the order in the log window.
- **Remove** an option. Notes that already use it keep it; it just stops being offered.
- **Restore defaults** to put the original list back. Your notes are not changed.

Next to each option is the number of notes that use it.

Flow and pain names only change what you see in the log window, dashboards and PDF reports. Notes keep storing the level, for example `flow: medium` or `pain: 3`, so the data stays the same.

Options you type with "Add other…" while logging are still saved to these lists automatically. The medication "helped" choices (Not sure / No relief / Some relief / Full relief) stay fixed, because the "how often it helped" figures depend on them.

## Separate dashboards

Everything from the two original plugins is still here, unchanged:

- **Period Tracker:** its own dashboard (**Period Tracker: Open dashboard**), *Log today*, *Period started today*, PDF report, CSV export, status bar, and the `period-tracker` code block.
- **Migraine Tracker:** its own dashboard (**Migraine Tracker: Open dashboard**), *Log a migraine*, *End ongoing migraine now*, *Edit this migraine episode*, doctor PDF report, CSV export, and the status bar.

Their settings (folders, pain scale, predictions, reports) are under **Settings → Period Tracker** and **Settings → Migraine Tracker**. Their choice lists are edited in Health Dashboard (see above).

## Commands

- Health Dashboard: Open dashboard / Open … tab / Create health report (PDF, all dashboards) / Add a general note / Log a missed period (no exact date) / Log a missed migraine (no exact date) / Insert dashboard link in this note / Insert inline dashboard link (inside a sentence)

**Copy layout diagnostics (for troubleshooting)** copies a short report of how the open dashboard is laid out and which styles affect it (including your theme and CSS snippets). Paste it when reporting a display problem.
- Doctor Visits: Log a visit / Open dashboard / Create PDF report for doctor / Edit this visit (when a visit note is open) / Export visits to CSV
- Blood Pressure: Log a reading / Open dashboard / Create PDF report for doctor / Edit this reading / Export to CSV
- Sickness Tracker: Log sickness / I'm better (end ongoing sickness) / Create PDF report for doctor / Open dashboard / Edit this entry / Export to CSV
- Medications: Add medication / Print medication list (PDF) / Open dashboard / Edit this medication / Export to CSV
- A1C: Log A1C result / Create PDF report for doctor / Open dashboard / Edit this result / Export to CSV
- All the original Period Tracker and Migraine Tracker commands

## Link to the dashboard from a note

Put a clickable link in any note that opens the Health dashboard in a new tab. Run **Insert dashboard link in this note** from the command palette, or paste:

````
```health-link
label: Health dashboard
```
````

Optional lines (each one overrides the default from settings):

| Option | Example | What it does |
|---|---|---|
| `label` | `label: My health` | Text on the link |
| `tab` | `tab: bp` | Tab to open: `overview`, `period`, `migraine`, `visits`, `bp`, `illness`, `meds` or `a1c`. Plain names work too, such as `blood pressure`, `medications`, `sickness` or `doctor` |
| `size` | `size: large` | `tiny`, `small`, `medium`, `large`, `xl`, `xxl`, a multiplier (`1.5`), a percent (`150%`) or pixels (`22px`). The whole link scales together |
| `style` | `style: button` | `card` (picture, title, subtitle), `button` (compact pill) or `icon` (picture only) |
| `align` | `align: center` | `left`, `center` or `right` on its line |
| `float` | `float: right` | Sit beside the following text, which wraps around it (`left` or `right`) |
| `width` | `width: full` | Stretch the card across the note |
| `icon` | `icon: stethoscope` | Any [Lucide](https://lucide.dev) icon name. A link to one tracker's tab shows that tracker's icon unless you set an icon or picture |
| `image` | `image: [[Attachments/health.png]]` | A picture from your vault (path or wikilink) or an image URL |
| `subtitle` | `subtitle: Log this morning's reading` | Second line on the card style |

### Inline links (anywhere in a sentence)

To put the link *inside* text (a sentence, list item, callout or table cell), use inline code. Run **Insert inline dashboard link (inside a sentence)** from the command palette, or type:

```
Before the appointment, check my `health-link: label=blood pressure; tab=bp` readings.
```

Options use `key=value` separated by `;` (or `|`), and are the same as above. `size` works too, and inline links default to the compact button that matches the surrounding text. Plain `` `health-link` `` uses your defaults, and `` `health-link: My health` `` sets just the label.

Inline links render in Reading view and in Live Preview. In Live Preview, put your cursor on the link's text to edit its code.

**Default icon and picture.** The default is a heart-pulse icon. To change it for every link, go to **Settings → Health Dashboard → Dashboard link**. There you can:
- Set a different icon name and the default size and style.
- **Choose…** a picture already in your vault.
- **Upload…** one from your computer (saved as `link-picture.*` in your Health Notes folder).
- Paste a path or URL.

The preview at the top updates as you go, and links already in your notes update too. If a picture can't be found, the link falls back to the icon.

**New tab behavior.** Clicking opens the dashboard in a new tab. If it's already open, the link switches to that tab instead; turn on **Always open a new tab** if you'd rather get a fresh tab every time.

**Turned-off trackers.** A link to a tracker you've turned off opens the Overview instead, and comes back to life when you turn the tracker on again.

**Plain Markdown links.** These also work: `[Health](obsidian://health-dashboard)` or `[Blood pressure](obsidian://health-dashboard?tab=bp)`.

## Embed a dashboard in a note

````
```health-dashboard
```
````

To start on a specific tab, put `overview`, `period`, `migraine`, `visits`, `bp`, `illness`, `meds` or `a1c` inside the block. The original `period-tracker` block still works too.

## Privacy

Everything stays in your vault, and the plugin makes no network requests. Settings for all three parts are saved in `.obsidian/plugins/health-dashboard/data.json`.

## Disclaimer

This is for personal record-keeping. It is not a medical device and does not diagnose anything.

## Development

The plugin is plain JavaScript with no dependencies. `build.js` combines the sources in `src/` with the original Period Tracker and Migraine Tracker plugins in `vendor/`, applying small patches, into `dist/main.js` and `dist/styles.css`.

```
npm run build       # builds dist/main.js, dist/styles.css and dist/manifest.json
npm test            # builds, then runs the test suites against a mock of Obsidian
npm run test-data   # writes about 7 months of made-up notes for every dashboard into test-data/
```

**Releasing.** Set the new version in `manifest.json` and `package.json`, add it to `versions.json` and push to `main`. Then open **Actions → Release → Run workflow**. It builds the plugin and publishes a GitHub release tagged with that version, with `main.js`, `manifest.json` and `styles.css` attached, which BRAT picks up. Pushing a tag with exactly that version (for example `1.16.5`) does the same.
