# Thought Catcher technical reference

[Back to the project README](../README.md)

A minimalist local browser workspace for capturing and organizing activities.
React and TypeScript provide the interface; an Express and TypeScript API is the
only component that accesses PostgreSQL.

## MVP features

- Use **New activity** to create a note in Noteboard, a task from Todo or Board,
  or an event from Calendar. The view supplies its type automatically, so only
  a title needs to be entered. There is no separate capture bar.
- Todo shows tasks in timing groups: overdue, today, upcoming, undated, and completed.
- A Kanban Board view of all tasks matching its filters, with To Do, In Progress,
  and Completed columns. Saved view profiles provide different board setups;
  there is no separate board creation, selection, or membership interface.
  Create a new task while viewing Board. Drag
  cards or activate their progress tag with the mouse or keyboard to cycle
  To Do → In Progress → Completed → To Do. Progress tags show red, yellow, and
  green respectively, alongside their text labels. They reflect shared status
  and are separate from user-created labels. Cards have no column dropdown or
  remove-from-board button.
- Pointer dragging moves a full floating copy of the activity while its source
  stays hidden in place. Start from the handle or a noneditable card background;
  text fields keep ordinary caret and selection behavior. A valid column or
  Trash drop commits on release. Dropping elsewhere, pressing Escape, changing
  views, or losing window focus cancels the drag. Trash highlights red on hover.
- Board cards show an existing deadline only, without event dates or empty date
  inputs. Other fields remain stored and available in the relevant views.
- A standard month calendar with task deadlines and event entries. Select a
  date to create an event with its event date prefilled; edit entry titles
  directly. Tasks appear on their deadline and events on their event date;
  notes with dates also appear on their deadline and/or event date. A separate
  type filter can hide notes, tasks, or events from Calendar without changing
  their data. An **Undated events** section keeps events without an event date
  accessible. There are no hourly scheduling slots.
- Titles and plain-text content are directly editable in Todo, Kanban, and
  Noteboard blocks. Clicking text places the native caret where you click,
  without replacing the block with a form or enlarging it just to edit.
  Calendar entry titles use the same inline editing behavior.
- Inline text saves when you leave a field, or with **Ctrl+Enter** /
  **Cmd+Enter**. Enter also saves a title; **Escape** restores its stored value.
  Validation and failed-save feedback keep the draft visible for correction
  or retry. Each field update preserves the activity's other fields.
- Add labels with a block's **+** button, confirm a tag with Enter or comma,
  and remove custom labels with their chip controls. Existing tags are suggested
  as you type; use Up/Down to select a suggestion and Enter to confirm it, or
  enter a new label directly. Escape cancels adding a tag. Existing-activity edits stay in
  the page, without Details dropdowns. Visible date fields can be edited
  directly; progress controls change the shared activity status.
- Every activity has exactly one reserved type tag: `note`, `task`, or `event`.
  Add a different reserved tag with **+** to replace its current type; there is
  no separate Type dropdown. The reserved chip cannot be removed on its own,
  while other labels remain flexible. Notes appear
  in Noteboard, tasks in Todo and Kanban, and dated records in Calendar according
  to the date rules above.
- Noteboard defaults to a simple grid showing content and labels; optional
  grouping is by tag. It does not divide notes into Todo timing sections.
  Activities with several labels can appear in several groups while remaining
  one record. A new note appears as an ordinary blank block in the same grid,
  with the cursor in its title. There are no Save/Cancel buttons or separate
  draft row. Blank notes remain local; entering a valid title and leaving the
  field saves the note automatically. Further title/content edits save inline,
  including content entered while initial creation is in progress. Other views
  retain their creation dialog.
- Search across titles, content, and tags; tag and completion filters; sorting
  by update time, creation time, deadline, or title.
- **Customize → Filter by tags** provides searchable checkboxes in every
  activity view. Selecting several labels requires a match on every selected
  label (AND); **Clear tags** removes the filter. Active filter chips remain
  visible above the content and can be removed individually. Saved profiles
  retain the full selected-tag array alongside their other view settings.
- Calendar has independent note/task/event type visibility filters. Saved
  profiles retain these choices alongside their other filters.
- Customize grouping and the visibility of dates, tags, completion controls,
  and content previews. Save the configuration as a named view and reopen it
  from the new-tab picker. Saved profiles persist in PostgreSQL.
- Browser-style application tabs in a full-width workspace. The **+** button
  opens a blank tab where you choose Todo, Board, Calendar, Noteboard, Trash, or a saved
  view. You can open multiple tabs of the same view. Every tab can be closed,
  including the last; with zero tabs, the same default-and-saved-view picker
  remains available. Choosing a view opens a tab.
- Open tabs and the active tab are stored in this browser's local storage,
  including an intentionally empty tab list. Unsaved filters stay with their
  tabs during the current session. Saved configurations
  restore after refresh. Tabs navigate Thought Catcher views, rather than
  browsing external websites.
- Loading, empty, error, and retry states; labeled controls, modal editors,
  visible keyboard focus, and text/symbols alongside deadline colors.
- Reversible Trash. Each activity view has a fixed bottom-corner Trash target:
  drag an activity's dedicated handle onto it, or click the target to open
  Trash. Each block and calendar entry also has a labeled Trash button for
  keyboard access. Editable text remains available for ordinary text selection.
  Restore returns the original activity, including its tags, content, dates,
  progress, and any legacy board memberships. No permanent-delete control is provided.

Select **Customize** to save a profile. For example, a Project Ideas noteboard
can filter the `project idea` tag, sort by recently updated, and show previews.
View changes are temporary until saved as a new profile or applied with
**Update saved view**. Existing profiles can also be deleted.

The **?** button lists shortcuts: **Alt+N** starts an inline note draft and focuses
its title, opening a new Noteboard tab when another view is active;
**Alt+1**, **Alt+2**, **Alt+3**, and **Alt+4** open new Todo, Board, Calendar, and
Noteboard tabs respectively. From a blank or empty workspace, **Alt+N** also
opens Noteboard and starts a note draft. Shortcuts do not intercept typing in form fields.
Every core action also has a visible control.

## Local setup

Requires Node.js 22.12 or newer, npm, and a running PostgreSQL server. PostgreSQL
must support `gen_random_uuid()` (PostgreSQL 13 or newer). Use a current maintained
Node.js release. The frontend development server proxies API requests to port
3000; keep that backend port unless you also change `frontend/vite.config.ts`.

```sh
git clone https://github.com/d-kwong/thought-catcher.git
cd thought-catcher/backend
npm install
cp .env.example .env
```

Edit `backend/.env` with your local PostgreSQL role and database. Set `PGPASSWORD`
there if your server requires a password. Local secrets are ignored by Git;
`.env.example` is tracked. Create the database once, using your PostgreSQL role:

```sh
createdb thought_catcher
```

If `createdb` or `psql` is unavailable, add your PostgreSQL installation's `bin`
directory to PATH. Database creation may require a role with `CREATEDB`; an
existing database supplied by your administrator works too.

From `backend`, apply migrations and start the API:

```sh
npm run migrate
npm run dev
```

The migration runner records filenames and checksums in `schema_migrations` and
applies pending files in order. It recognizes the earlier manual `001`/`002`
setup, preserving existing activities and converting former task/note kinds to
ordinary tags. Do not edit an applied migration: add a new numbered SQL file.
Migrations are run explicitly, rather than automatically at API startup.
Migration `005` preserves an existing unique reserved type tag. For older
records with multiple or no reserved tags, board membership selects `task`,
otherwise an event date selects `event`, otherwise the record becomes `note`.
The conversion preserves content, custom labels, dates, progress, and links.

In a second terminal, from the repository root:

```sh
cd frontend
npm install
npm run dev
```

Open the URL printed by Vite (normally http://localhost:5173). The API defaults
to http://localhost:3000; `/health` reports process health, not database health.
The database role also needs permission to create application tables for
migrations. The browser never receives database credentials.

## Data model

An activity is the single shared content record. The interface supplies one type
tag automatically; only a title needs user input. `note`, `task`, and `event` are
reserved behavioral tags selecting the relevant views. Other labels such as
`school` or `project idea` remain descriptive. Plain-text content, additional
labels, deadline, event date, and progress remain flexible for every type.
Changing a type or label preserves those fields and any legacy board links.

The database stores the type once in `activity_type`, constrained to the three
supported values. Responses derive its reserved tag from that column; custom
labels use the tag/link tables. This prevents conflicting type tags while
keeping ordinary labels independent. A task converted to a note disappears
from task views; converting it back returns it to the matching task views.

Progress belongs to the activity: `todo`, `in_progress`, or `completed`.
Kanban columns display that shared status. Moving an activity changes its status
everywhere, including other saved Board views; marking it complete in Todo
also places it in the completed column wherever it matches a Board profile.
Views filter the same records without copying them. Legacy board memberships
remain preserved in the database and are not used by the current Board UI.

Tags are trimmed and exact-case: duplicate names are collapsed. Only lowercase
`note`, `task`, and `event` are reserved; `Note` remains an ordinary label.
Responses place the reserved type tag first, followed by custom tags sorted by the database collation.
Separate tag and membership tables let activities share labels without copying
content.

Deadlines (`due_date`) and event dates (`event_date`) are separate calendar dates,
represented as `YYYY-MM-DD` strings through SQL, the API, and the interface. They
are not midnight timestamps. Creation, update, and completion times are instants:
PostgreSQL stores `TIMESTAMPTZ`, `pg` returns JavaScript Dates, and JSON serializes
ISO timestamp strings. TypeScript describes values during development; Zod
validates incoming requests at runtime, and SQL constraints retain basic data
integrity.

A saved view is a named configuration referencing activities: its view type,
filters, sort order, grouping, visible fields, and view-specific settings.
Open workspace tabs are navigation state, separate from saved views and records.
Hiding a field in a view never deletes its data.

## API

Successful JSON responses use `{ "data": ... }`. Errors use
`{ "error": { "code": "...", "message": "..." } }`; validation errors also
include field issues. Invalid input returns 400, absent resources return 404,
and unexpected failures return 500 without exposing database details.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Process health |
| GET / POST | `/api/activities` | List / create activities |
| GET / PATCH / DELETE | `/api/activities/:id` | Retrieve / edit / move an activity to Trash |
| GET | `/api/trash` | List trashed activities, most recently trashed first |
| POST | `/api/trash/:id/restore` | Restore a trashed activity |
| GET / POST | `/api/boards` | List / create boards |
| GET | `/api/boards/:boardId` | Board and activity memberships |
| PUT / DELETE | `/api/boards/:boardId/activities/:activityId` | Place / remove an existing activity |
| GET / POST | `/api/views` | List / create saved view profiles |
| PATCH / DELETE | `/api/views/:viewId` | Edit / delete a saved view profile |

```sh
curl -i http://localhost:3000/api/activities \
  -H 'Content-Type: application/json' \
  -d '{"title":"Explore an idea","tags":["project idea","note"],"due_date":"2026-11-01"}'

curl http://localhost:3000/api/activities
```

Activity creation requires `title` and `tags` (a string array containing exactly
one reserved type). It accepts optional `body`, `due_date`, `event_date`,
and `status` (`todo`, `in_progress`, or `completed`, default
`todo`). `completed` remains a boolean convenience: true means `completed`, false
means `todo`; an explicit compatible `status` takes precedence. Conflicting status
and completion values are rejected. The server owns completion timestamps;
clients cannot send `completed_at`. Completing an already-completed activity
preserves its timestamp; reopening clears it.
PATCH preserves omitted fields. Explicit `null` clears body or dates. A supplied
tag array replaces labels and must still contain exactly one reserved type;
send only that type to clear custom labels. Clients change type through `tags`,
rather than sending `activity_type` directly. DELETE moves the activity to Trash by setting
`deleted_at`; it preserves its content, tags, dates, progress, completion time,
and any legacy board memberships. Normal activity and board responses hide trashed records,
and normal edits reject them. Restore clears `deleted_at` and returns the same
activity to its views and boards. Trash and restore update `updated_at`.
Trashing an already-trashed or missing activity, or restoring an active or
missing activity, returns 404. There is no permanent activity-delete operation.
Removing a board membership through the API preserves the underlying activity.

The `/api/boards` routes and their membership data remain available for legacy
compatibility; the current UI does not use them. Legacy placement uses
`{ "column": "todo" | "in_progress" | "done", "position": 0 }` with position
optional. `done` maps to the activity status `completed`. Current Kanban controls
update shared activity status through PATCH instead. Older saved `board_id`
settings remain stored but are ignored by the current frontend.

## Verification and builds

From `backend`:

```sh
npm run typecheck
npm test
npm run build
npm start
```

Integration tests require a connection to the configured PostgreSQL database
and permission to create a schema. They isolate migrations and test data from
application tables and roll them back. They cover legacy-data migration,
runtime validation, create/list/edit/clear behavior, shared status across boards,
saved-profile persistence, and Trash/restore preservation of data and board
memberships. Type checking currently covers backend
source files; integration tests execute through `tsx`.

From `frontend`:

```sh
npm run typecheck
npm test
npm run build
```

Frontend unit tests cover reserved-tag replacement, custom-label merging, drag thresholds, and valid drop targets.

The backend build writes `backend/dist`; the frontend build writes
`frontend/dist`. The development setup runs the frontend and API separately.
A public production deployment is a later step, including authentication,
ownership, and hosting configuration.

For a manual smoke check, create a note in Noteboard, click into its text,
and verify the caret stays at the clicked position without changing block size.
Edit its title and content, leave each field to save, add and remove a tag, and
refresh. Set dates and progress while creating an activity, then verify further
text edits preserve them. Check **Escape**, empty-title validation, and keyboard save.
Change its type to task and confirm it moves to Todo while preserving its
fields. Its task should appear in Board without a manual add step. Calendar
should show tasks on deadlines and events on event dates;
events without dates remain accessible in its Undated events section.
Change its Board column and confirm the same progress in Todo and other saved
Board views. Check the relevant date entries in Calendar. Save a filtered
noteboard profile with previews hidden, reopen it, and unhide previews to verify
the activity's content remains. Check progress-tag keyboard activation, modal Escape/return
focus, and shortcuts using the keyboard. Open multiple tabs, close an inactive
tab without changing the active view, then close the last tab and refresh to
verify zero tabs persist and the view picker remains available. Choose a saved
profile directly from that picker, or use **+** from an open view. Move a
disposable activity to Trash with its handle and with its keyboard-accessible
Trash button, then restore it and verify its original fields and task-view
visibility return. Stop the
API to verify the error state and retry after restarting it.

## Project boundaries

This is a local development MVP. Reminder delivery and scheduling semantics,
rich-text editing, pagination, and public authentication/ownership remain
planned. No AI integration, chat, embeddings, or model infrastructure is present.
Future AI features must use the same validated and authorized operations as
ordinary controls; provider, retrieval, privacy, approval, and cost decisions
remain open.
