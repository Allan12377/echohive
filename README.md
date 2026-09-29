# EchoHive

## Run with Docker

1. Copy `.env.example` to `.env` and set a strong `JWT_SECRET`.
2. Start the full stack:

   ```sh
   docker compose up --build
   ```

3. Open `http://localhost:3000`. This is the EchoHive web app; its API and Socket.IO traffic are routed through Nginx.

The Compose stack includes the EchoHive web client, API, PostgreSQL, and Redis. API startup applies pending database migrations. PostgreSQL, Redis, and uploaded media are retained in named volumes.

For local development, configure `.env`, start PostgreSQL and Redis, then run `npm run db:generate`, `npm run db:migrate`, and `npm run dev`. The web client runs on port 3000 and the API on port 4000.

## Current scope

EchoHive includes API routes for accounts, messaging, profiles, marketplace listings, clips, statuses, and calls. Some previews and sample content remain browser-only; do not assume those local interactions are persisted unless the corresponding API flow is used.
