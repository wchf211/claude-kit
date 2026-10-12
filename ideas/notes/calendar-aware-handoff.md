# Calendar-aware Handoff

**Verdict: yes, on your Mac.** It needs no API keys if it reads the macOS Calendar app, which already syncs your Google Calendar. It only works locally, which is fine, because the Handoff button is local anyway.

## What already exists
- **icalBuddy** (Homebrew: `brew install ical-buddy`) reads the Mac Calendar app, including synced Google calendars. `icalBuddy -n -nc -iep "title,datetime" -b "" eventsToday` lists the rest of today's events. See [View Mac Calendar from Command Line](https://davidwalsh.name/calendar-command-line) and [mac calendar command line](https://techearl.com/mac-calendar-command-line).
- **gcalcli** talks to the Google Calendar API directly (`gcalcli agenda --tsv now 'today 23:59'`). It needs a one-time OAuth setup. See the [gcalcli man page](https://manpages.org/gcalcli).
- session-hud already supports fixed break times (`breakTimes` in `/config`) and reads local time from the host. The calendar only has to supply more break times.

## Smallest useful version
1. In session-hud, every 10 minutes, run `icalBuddy` through `$.process.run` and parse the start times and titles of today's remaining events. If icalBuddy is missing, skip quietly.
2. Merge those events with `breakTimes`, so Handoff shows "1:1 with Alex at 14:00 (in 25 min)".
3. Add a `/config` option `calendarSource` with the values `off`, `icalbuddy` and `gcalcli`, defaulting to `off`, plus a filter for which calendars count (for example only "Work" and "Family").
4. Skip all-day events and events you declined.

Size: about half a day with icalBuddy, plus about 2 hours for gcalcli support.

## Risks and open questions
- macOS asks once for Calendar permission for the terminal app that runs Claude Code.
- Meetings back to back would nudge all day, so only nudge before events at least 30 minutes long, or only before the last event of the day.
- Privacy: event titles appear in the band on screen. They are not sent to the model.

## Next step
On your Mac, run `brew install ical-buddy && icalBuddy -n -nc -iep "title,datetime" -b "" eventsToday`. If the output shows your Google events, tell me and I will build steps 1 and 2.
