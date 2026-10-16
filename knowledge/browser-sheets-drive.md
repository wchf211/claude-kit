# Browser, Google Sheets and Drive tricks

Faster routes for Sheets and Drive work through Claude in Chrome. Verified 2026-10-16.

## Sheets
- Add many rows or links: build a TSV in Python, `pbcopy` it, click the Name box, type `A44`, press Return, press `cmd+v`. Formulas and `=HYPERLINK(...)` arrive as formulas. This is far faster than inserting images one by one.
- Check where existing images sit before pasting. A pasted table can end up hidden under an image; paste further right.
- Copy the sheet's existing balance formula (click a balance cell and read it) instead of typing values.
- A Gemini side panel can open by itself. Close it with the X. It was not the cause of any block.
- If Sheets says "open in another tab for offline editing", reload the tab.

## Drive
- Drive file or folder ID of a locally synced file: `xattr -p 'com.google.drivefs.item-id#S' <path>`. Link format: `https://drive.google.com/file/d/<id>/view`.
- Share a folder: open `https://drive.google.com/drive/folders/<id>`, "Manage access", type the email, pick the suggestion, change role from Editor to Viewer (Editor is the default), Send. Reload to confirm; the side panel can show stale "Private to you".
- The Drive picker inside Sheets is single-select. Searching a full file name returns nothing; search one short word.

## Chrome automation
- Tabs often freeze ("Script injection timed out"). Wait 5-10 s and retry once or twice, then ask the user to click or reload the tab. Do not loop.
- Use `browser_batch` for sequences of clicks and screenshots.
