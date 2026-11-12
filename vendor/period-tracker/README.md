# Period Tracker for Obsidian

Log your menstrual cycle in Obsidian, see where you are in your cycle on a dashboard, and create a PDF report to take to your doctor. Every logged day is an ordinary Markdown note, so your data stays in your vault and remains readable even without the plugin.

## Features

- **Quick logging** – flow (none, spotting, light, medium, heavy), pain 0–5 (no pain, very mild, mild, moderate, severe, very severe), picked from buttons, symptoms, medication and notes. One-tap "Period started" command.
- **Customizable lists** – edit the symptom and medication lists in settings, or add new items on the fly while logging.
- **Dashboard** – cycle day, next-period prediction (or how many days late), average cycle and period length, an estimated fertile window, a month calendar (click any day to log or edit it), a cycle-length chart, symptom frequency, pattern notes and a recent-periods table.
- **PDF report** – A4 report with summary statistics, patterns worth discussing (cycles shorter than 21 or longer than 35 days, periods over 7 days, large variation, severe pain), a cycle-length chart, period history, symptom and medication frequency and an optional daily log with notes. Choose the last 3, 6 or 12 months, all data, or a custom range. Generated entirely offline, works on mobile.
- **CSV export** of all logs.
- **Status bar** – "Cycle day 12 · next in 16d".
- **Embeddable** – put the dashboard in any note:

  ````
  ```period-tracker
  ```
  ````

## Installation (manual)

1. In your vault, create the folder `.obsidian/plugins/period-tracker/`.
2. Copy `manifest.json`, `main.js` and `styles.css` into it.
3. In Obsidian go to **Settings → Community plugins**, turn off Restricted mode if needed, and enable **Period Tracker**.

No build step is needed – `main.js` is plain JavaScript.

## Commands

| Command | What it does |
| --- | --- |
| Period Tracker: Open dashboard | Opens the dashboard (also the droplet icon in the ribbon) |
| Period Tracker: Log today | Opens the log window for today |
| Period Tracker: Period started today | Saves today with medium flow (keeps existing details) |
| Period Tracker: Create PDF report | Choose a range and options, saves and opens the PDF |
| Period Tracker: Export all logs as CSV | Writes a CSV to the report folder |

## Data format

Each day is saved to `Period Tracker/Logs/YYYY-MM-DD.md` (folder configurable):

```yaml
---
type: period-log
date: 2026-11-09
flow: medium        # none | spotting | light | medium | heavy
pain: 3             # 0-5, omit if not recorded
symptoms: [Cramps, Bloating]
medications: [Ibuprofen]
notes: Started in the afternoon
---
```

You can edit these notes by hand, add your own text below the frontmatter, or create them from templates. The dashboard updates as soon as a note changes. Comma-separated strings work as well as lists.

## How predictions work

- Consecutive bleeding days (light, medium or heavy; spotting optionally) form a period. A single unlogged day inside a period does not split it.
- Cycle length is the number of days from one period's first day to the next.
- Predictions use the average of your most recent cycles (6 by default). Until two periods are logged a 28-day default is used and labelled as such.
- The fertile window is a calendar estimate: ovulation is placed 14 days (configurable luteal phase) before the predicted period, and the window spans the 5 days before ovulation through the day after. **It is not reliable for contraception or for planning pregnancy.**

## Privacy

Everything stays in your vault. The plugin makes no network requests. If you sync your vault, your logs sync with it — choose your sync service accordingly.

## Disclaimer

This plugin is for personal record-keeping. It is not a medical device and does not diagnose anything. The reference ranges in the report are general guidance for adults. Talk to a clinician about any concerns.
