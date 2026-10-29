# Thought Catcher

A learning project for capturing tasks, notes, events, and reminders.

## Implemented

- Express and TypeScript backend with PostgreSQL persistence
- Shared activity records for tasks and notes
- Runtime validation with Zod and database constraints
- `GET /health`: process health (does not check the database)
- `POST /api/activities`: create a task or note
- `GET /api/activities`: list activities, newest first
- Development, type-checking, build, and integration-test scripts

## Local setup

Requires Node.js, npm, and a running PostgreSQL server.

From `backend`:

```sh
npm install
cp .env.example .env
```

Edit `.env` to match your local PostgreSQL role and database. Create the
`thought_catcher` database if it does not exist. On a fresh database, apply:

```sh
psql -d thought_catcher -v ON_ERROR_STOP=1 -f migrations/001_create_activities.sql
```

The first migration was applied manually during development. Do not rerun it
against a database that already has the activities table. Migration tracking
is not implemented yet. The `psql` command must be on your PATH, or use its
full installation path.

```sh
npm run dev
```

Visit http://localhost:3000/health (or the PORT specified in `.env`).

## Try the API

```sh
curl -i http://localhost:3000/api/activities \
  -H 'Content-Type: application/json' \
  -d '{"kind":"task","title":"Try Thought Catcher","due_date":"2026-11-01"}'

curl http://localhost:3000/api/activities
```

Successful responses use `{ "data": ... }`. Errors use
`{ "error": { "code": "...", "message": "..." } }`; validation errors also
include field issues. Creation returns HTTP 201; invalid inputs return 400.
Due dates remain `YYYY-MM-DD` strings; timestamp fields serialize as ISO strings.
Notes cannot have due dates. Plain-text bodies are optional.

## Checks and production build

From `backend`:

```sh
npm run typecheck
npm test
npm run build
npm start
```

Integration tests require the configured PostgreSQL database and applied
migration. They use an ephemeral local HTTP port and roll back their inserts.

## Planned

- Editing and completing activities, with completion shared across views
- React frontend, boards, calendar, tags, and saved view configuration
- Pagination and automated migration tracking
- Authentication and ownership: the current API is for local development;
  access control must be designed before public deployment
