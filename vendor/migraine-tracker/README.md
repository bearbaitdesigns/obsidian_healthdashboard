# Migraine Tracker for Obsidian

Log migraine episodes and see your patterns on a dashboard with statistics and a calendar.

## Install

1. In your vault, open the folder `.obsidian/plugins/` (show hidden files if you can't see `.obsidian`).
2. Create a folder named `migraine-tracker` and put `manifest.json`, `main.js` and `styles.css` inside it.
3. In Obsidian, go to **Settings → Community plugins**, turn off Restricted mode if needed, click the refresh icon, and enable **Migraine Tracker**.

Works on desktop and mobile. No build step or dependencies.

## Logging an episode

Click the **⊕ ribbon icon** or run **Migraine Tracker: Log a migraine** from the command palette. The form records:

| Field | Notes |
|---|---|
| Start and end date | Dates only. Leave the end empty while it's ongoing; "Today" fills in today. Duration is counted in days (a one-day migraine = 1 day). |
| Time of day it started | Morning, Afternoon, Evening, Night, or Woke up with it. |
| Time of day it ended | Morning, Afternoon, Evening, Night, or Gone after sleep. Leave it empty while the migraine is ongoing. |
| Migraine type | With/without aura, menstrual, vestibular, chronic, etc. |
| Where it happened | Home, work, school, car, etc. |
| Pain level | Maximum and average, picked from a row of buttons on a 0–5 scale (1–2 mild, 3 moderate, 4–5 severe). You can switch to 0–10 in settings. |
| Headache location | Left/right side, temples, behind the eyes, back of the head, neck… |
| Symptoms, possible causes, relief tried | Multi-select chips. |
| Medications | Name, dose, date taken, time taken (optional), and whether it helped. The date defaults to the start date. Acute-medication days are counted from these dates. |
| Notes | Free text. |

Every list has an **Add other…** box. Anything you add is remembered for next time. You can edit all of the lists under **Settings → Migraine Tracker**.

Each episode is saved as a note in the `Migraine Log` folder (you can change this) with the data in its properties. Your data stays as plain text in your vault and works with search, Properties, Dataview and Bases. You can move the notes anywhere: episodes are found by their `entry: migraine` property.

## Dashboard

Open it with the **brain ribbon icon** or the command **Migraine Tracker: Open dashboard**. It shows:

- **Stat tiles:** episodes and per-month rate, migraine days (and % of days), average and longest duration, average max and average pain, days since the last migraine, and acute-medication days in the last 30 days. The last one is highlighted at 10+ days, which is configurable, because frequent use can lead to medication-overuse headache.
- **Calendar:** each day is shaded by peak pain, and a dot marks a day you took medication. Click a day to edit its episode or log a new one on that date.
- **Charts:** migraine days per month for the last 12 months and a peak-pain histogram, plus top causes, symptoms, headache locations, relief, medications (with how often each helped), type, where attacks started, time of day it started and ended, and day of week.
- **Episode table:** for the selected period, with edit buttons.
- **Period selector:** 30 days, 90 days, 6 months, 12 months, or all time.
- **CSV:** writes a CSV of all episodes.
- **Doctor report:** creates a PDF for a doctor visit (see below).

A banner and status-bar timer appear while a migraine is ongoing, with an **End now** button.

## PDF report for your doctor

Click **Doctor report** on the dashboard, or run **Create PDF report for doctor**. Then:

1. Choose a period: the last 30 days, 3, 6 or 12 months, all time, or custom dates.
2. Optionally add your name and any questions you want to bring to the appointment.
3. Choose whether to include the full episode log.

The PDF is saved to `Migraine Log/Reports/` and opens in Obsidian, where you can print or share it. It contains:

- **Summary:** episodes and headache days per month, % of days with a migraine, average and longest duration, average peak and average pain, acute-medication days per month, episodes with aura, most common type and trigger.
- **Medication-use note:** shown when acute-medication days per month reach your alert threshold.
- **Charts:** headache days per month, and peak-pain distribution.
- **Calendar:** each month shaded by pain.
- **Medications table:** doses recorded, episodes, days used, and how often each one helped.
- **Pattern breakdowns:** causes, symptoms, headache location, relief, time of day it started and ended, day of week, type, and where attacks started.
- **Your questions or notes.**
- **Episode log:** every episode with date, duration, type, pain, location, symptoms, causes, medications and notes.

The PDF is generated inside the plugin, so it works on desktop and mobile without any add-ons.

## Commands

- Log a migraine
- Open dashboard
- End ongoing migraine now
- Edit this migraine episode (when an episode note is open)
- Create PDF report for doctor
- Export episodes to CSV
