
use memory mcp and sequential thinking mcp. review @data-table.ts @data-table.ts  @src/components/data-table and associated code components hooks libs etc. and fix the following performance violatiosn thrown in the browser console

these are happening in the context of a fetch it looks like and are slowig down the UI severely.


iolation] 'message' handler took <N>ms
23:16:34.988 scheduler.development.js:14 [Violation] 'message' handler took 173ms
23:16:36.039 scheduler.development.js:14 [Violation] 'message' handler took 647ms
23:16:38.185 scheduler.development.js:14 [Violation] 'message' handler took 746ms
23:16:39.151 scheduler.development.js:14 [Violation] 'message' handler took 790ms
23:16:50.629 scheduler.development.js:14 [Violation] 'message' handler took 792ms
23:17:01.793 scheduler.development.js:14 [Violation] 'message' handler took 610ms
23:17:04.075 scheduler.development.js:14 [Violation] 'message' handler took 762ms
23:16:35.427 task-store.tsx:182 [TasksProvider] Initializing... IDB first.
23:16:36.287 task-store.tsx:186 [TasksProvider] Found 50 in IDB.
23:16:36.288 task-store.tsx:74 [TasksProvider] Fetching all tasks from server...
23:16:37.374 react-dom-client.development.js:16378 [Violation] 'success' handler took 1081ms
23:16:38.267 task-store.tsx:88 [TasksProvider] Successfully fetched 50 tasks.
23:16:38.278 task-store.tsx:118 [TasksProvider] Fetched data signature is different, updating.
23:16:38.293 actions.ts:226 Fetch finished loading: POST "http://localhost:3000/".

# [Shadcn Table](https://tablecn.com)

This is a shadcn table component with server-side sorting, filtering, and pagination. It is bootstrapped with `create-t3-app`.

[![Shadcn Table](./public/images/screenshot.png)](https://tablecn.com)

## Documentation

See the [documentation](https://diceui.com/docs/components/data-table) to get started.

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org)
- **Styling:** [Tailwind CSS](https://tailwindcss.com)
- **UI Components:** [shadcn/ui](https://ui.shadcn.com)
- **Table package:** [TanStack/react-table](https://tanstack.com/table/latest)
- **Database:** [Neon](https://neon.tech)
- **ORM:** [Drizzle ORM](https://orm.drizzle.team)
- **Validation:** [Zod](https://zod.dev)

## Features

- [x] Server-side pagination, sorting, and filtering
- [x] Customizable columns
- [x] Auto generated filters from column definitions
- [x] Dynamic `Data-Table-Toolbar` with search, filters, and actions
- [x] `Notion/Airtable` like advanced filtering
- [x] `Linear` like filter menu for command palette filtering
- [x] Action bar on row selection

## Running Locally

1. Clone the repository

   ```bash
   git clone https://github.com/sadmann7/shadcn-table
   ```

2. Install dependencies using pnpm

   ```bash
   pnpm install
   ```

3. Copy the `.env.example` to `.env` and update the variables.

   ```bash
   cp .env.example .env
   ```

4. (Optional) Run database using docker-compose.yml file

   ```bash
   docker compose up
   ```

5. Push the database schema

   ```bash
   pnpm run db:push
   ```

6. Seed the database

   ```bash
   pnpm run db:seed
   ```

7. Start the development server

   ```bash
   pnpm run dev
   ```

## How do I deploy this?

Follow the deployment guides for [Vercel](https://create.t3.gg/en/deployment/vercel), [Netlify](https://create.t3.gg/en/deployment/netlify) and [Docker](https://create.t3.gg/en/deployment/docker) for more information.

## Credits

- [shadcn/ui](https://github.com/shadcn-ui/ui/tree/main/apps/www/app/(app)/examples/tasks) - For the initial implementation of the data table.
