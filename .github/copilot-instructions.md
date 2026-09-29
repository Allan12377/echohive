# EchoHive

- Keep the project in the npm-workspaces monorepo structure.
- The browser client uses React, TypeScript, custom Webpack, Sass, Bootstrap, and Socket.IO Client.
- The API uses Express, TypeScript, Socket.IO, PostgreSQL via Prisma, and Redis for cache/presence capabilities.
- Keep REST endpoints under `/api/v1` and never commit secrets; use `.env.example` for configuration names.
- Mark unfinished authentication, persistence, and real-time behavior honestly. Do not imply demo UI state is persisted.
