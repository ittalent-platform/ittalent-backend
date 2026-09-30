# IT Talent Backend

Backend API service for the IT Talent platform, built with Express 5 and TypeScript. It features MongoDB (Mongoose), Redis, stateless JWT authentication, OpenAPI/Swagger UI integration, Vitest, and strict adherence to a 6-layer vertical-slice architecture.

---

## Tech Stack

- **Runtime & Language**: Node.js (ESM), TypeScript (strict mode), [tsx](https://github.com/privatenumber/tsx)
- **Web Framework**: Express 5
- **Database & ODM**: MongoDB with [Mongoose](https://mongoosejs.com/) (configured with replica set for transactions)
- **Cache & Rate Limiting**: Redis with `redis` and `express-rate-limit`
- **Authentication**: Stateless JWT (`jsonwebtoken` + `bcryptjs`) with access & refresh tokens
- **Validation & API Docs**: [Zod](https://zod.dev/), `@asteasolutions/zod-to-openapi`, and Swagger UI
- **Testing**: [Vitest](https://vitest.dev/) (unit & integration tests)
- **Code Quality**: ESLint (v9/v10 flat config) with `@typescript-eslint`
- **CI/CD**: GitHub Actions

---

## Architectural Directives (6-Layer Core)

Every feature module in `src/modules/<module-name>/` strictly implements 6 core layers:

1. `<module>.routes.ts`: Express router definitions and middleware bindings.
2. `<module>.controller.ts`: HTTP request/response orchestration and status mapping.
3. `<module>.service.ts`: Business logic and transaction management.
4. `<module>.repository.ts`: Database queries and storage interactions.
5. `<module>.openapi.ts`: OpenAPI path and schema definitions.
6. `<module>.schemas.ts`: Zod validation schemas for requests.
7. `<module>.constants.ts`: *(Optional)* Domain-specific constants.

Refer to [`AGENTS.md`](./AGENTS.md) for full architectural constraints.

---

## Quickstart

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

### 3. Start Database & Redis

Launch MongoDB and Redis via Docker Compose:

```bash
docker compose up -d
```

### 4. Initialize MongoDB Replica Set

MongoDB transactions require a replica set. The `mongodb-init` service in `docker compose up -d` automatically initializes `rs0` upon container startup.

If you ever need to manually (re-)initialize the replica set:

```bash
docker exec -it ittalent-backend-mongodb mongosh --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] })'
```

### 5. Run the Development Server

```bash
npm run dev
```

- API Base: `http://localhost:3000/api/v1`
- Swagger UI Documentation: `http://localhost:3000/docs`
- OpenAPI Specification: `http://localhost:3000/openapi.json`
- Health Probe: `http://localhost:3000/health`

### My Applications API

The authenticated candidate endpoints are:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/applications` | Apply for a Published, open job with a CV (required), cover letter and message (optional). One active application per job; after Withdrawn or Rejected the candidate may apply again as a new linked record (`reapplied_from` / `reapplied_as`), at most two per job, never after Hired. |
| `GET` | `/api/v1/applications/mine?jobPostingId=` | The caller's latest application for one job, or `{ item: null }`. |
| `GET` | `/api/v1/applications` | Bounded list of the caller's own applications, newest first; supports `page`, `limit`, `status` (one value or a comma-separated list), `jobId`, `submittedFrom`, `submittedTo`, `reviewStage`, `search` (job title or company name), `sortBy` (`submittedAt` default, `latestStatusAt`, `id`) and `sortOrder` (`desc` default, `asc`). Includes `statusCounts` over the matching filter set; every summary carries `canWithdraw`, `canApplyAgain`, `reappliedFrom` and `reappliedAs`. |
| `GET` | `/api/v1/applications/:id` | Owned application detail with the public job summary (from the job and its enterprise) and submitted attachment metadata only. `version` is the number of history entries. |
| `GET` | `/api/v1/applications/:id/history` | Chronological, bounded public status history. |
| `PATCH` | `/api/v1/applications/:id/withdraw` | Withdraws a `submitted` or `under_review` application; Withdrawn is closed and never reopened. Body: `{ "expectedVersion": 0, "reason": "optional, max 500 characters" }`. |

Successful responses are the resource/result objects directly (not wrapped in a `data` envelope). List and history responses use `{ items, page, limit, total, totalPages }`; list additionally returns `statusCounts`. Detail and withdrawal return the application detail object. Ownership is always derived from the authenticated JWT subject. Application history contains only status, stage, timestamp, and public actor role; attachment snapshots never contain file URLs or storage keys. The unique candidate/job index prevents reapplication in this scope.

This slice scopes Application directly to the existing active `User` identity. The separate ApplicantProfile lifecycle required by the broader use-case specification is not yet present in this new repository; wiring profile creation/repair into registration and Apply belongs to the dependent applicant-profile/job-application work. This implementation does not claim to satisfy that wider precondition. Likewise, the current document's later BR-APP-008 reapply and Position filled branch conflict with the earlier agreed BR-APP-002/seven-status scope; resolve product policy before extending the schema or UI.

The demo seeder (`npm run seed:applications`) is idempotent. It creates a demo candidate (`candidate-myapps@example.com` / `Candidate123!`, local development only), 13 applications covering every status plus the enterprises, jobs and documents they reference, a Withdrawn/apply-again pair, and two more candidates (one with no applications, one whose application the demo candidate must never see). `SEED_RESET=true` rebuilds those candidates' applications. Databases created before apply-again (BR-APP-010) run `npm run migrate:application-indexes` once. Attachment metadata is exposed without file URLs: preview or download needs a future authorization-aware API.

---


---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts server in watch mode using `tsx` |
| `npm run build` | Compiles TypeScript into `dist/` |
| `npm start` | Runs production build from `dist/server.js` |
| `npm run lint` | Runs ESLint on `src/` and `tests/` |
| `npm run lint:fix` | Fixes autofixable ESLint errors |
| `npm run typecheck` | Typechecks code without emitting files |
| `npm test` | Runs unit tests with Vitest |
| `npm run test:integration` | Runs integration tests |
| `npm run test:all` | Runs all unit and integration tests |
| `npm run generate:client` | Generates TypeScript client from OpenAPI |

---

## Adding a New Module

To add a new feature module (e.g. `posts`), create `src/modules/posts/` with the 6 standard layers:

```text
src/modules/posts/
├── posts.routes.ts
├── posts.controller.ts
├── posts.service.ts
├── posts.repository.ts
├── posts.openapi.ts
├── posts.schemas.ts
└── index.ts
```

1. Define Mongoose model in `src/models/post.model.ts`.
2. Implement repository, service, controller, and routes.
3. Define request schemas in `posts.schemas.ts` and OpenAPI docs in `posts.openapi.ts`.
4. Register the router in `src/modules/index.ts` and OpenAPI paths in `src/openapi/registry.ts`.
5. Add unit tests in `tests/unit/posts/`.

---

## License

MIT
