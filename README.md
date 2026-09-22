# Express Template

A clean, modular, and production-ready Express 5 + TypeScript template featuring MongoDB (Mongoose), Redis, stateless JWT authentication, OpenAPI/Swagger UI integration, Vitest, and strict adherence to a 6-layer vertical-slice architecture.

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
docker exec -it express-template-mongodb mongosh --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] })'
```

### 5. Run the Development Server

```bash
npm run dev
```

- API Base: `http://localhost:3000/api/v1`
- Swagger UI Documentation: `http://localhost:3000/docs`
- OpenAPI Specification: `http://localhost:3000/openapi.json`
- Health Probe: `http://localhost:3000/health`

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
