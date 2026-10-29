# Demo recordings

[Back to the project README](../../README.md)

These clips were recorded from the running local React application on macOS with fictional activities in a separate PostgreSQL schema. Existing application records were not used. The frontend and API source were unchanged for filming.

| Clip | Workflow | Length |
| --- | --- | --- |
| [Capture and organize](capture-and-organize.mp4) | Create a note inline, type its content, add a suggested project label, replace its type with task, and find it in Todo | 36 s |
| [Shared progress](shared-progress.mp4) | Drag to Completed, find the same task in Todo, reopen it, and drag it into In Progress | 27 s |
| [Calendar](calendar.mp4) | Select a day, type and save an event with its date prefilled, then browse to the undated event shelf | 26 s |
| [Saved views](saved-views.mp4) | Filter notes by the ideas label, name and save a profile, reopen it from the tab picker, and refresh | 28 s |
| [Trash and restore](trash-and-restore.mp4) | Drag a note to Trash, restore it, and return to the filtered Noteboard | 19 s |

Each clip has a looping GIF preview at the same filename. MP4s are 1920 × 1010 pixels at 30 fps; previews are 960 × 505 pixels at 10 fps. Audio was not recorded. The application area is cropped to exclude browser chrome. Typing is sent character by character with a variable delay of approximately 65–130 ms, plus input overhead, rather than inserting an entire field instantly. Recordings play at their captured speed; start/end idle footage was trimmed.

macOS `screencapture` captured the live interactions. AVFoundation exported the MP4s; ImageIO generated GIF previews from their frames. No application interface or activity animations were recreated for the recordings. Cursor highlights visible in the footage come from the computer-control session.

To record another take, run the app against a separate demo database or schema, seed fictional records, frame the application, and record a focused workflow. Keep text entry gradual, allow time to read completed states, and inspect both the exported video and GIF before replacing these files. The Calendar dates in these recordings belong to October 2026.
