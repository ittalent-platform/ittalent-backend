# AI Agent Directives (AGENTS.md)

When contributing to, refactoring, or generating code for this repository, all AI agents and human developers MUST strictly adhere to the following architectural, structural, and coding directives.

---

## 1. Modular Architecture & Vertical Slices
* Every single CRUD set, domain entity, or complex feature MUST be isolated into its own dedicated folder within `src/modules/` (e.g., `src/modules/auth/`).
* Never group code purely by technical layer across the entire application (e.g., placing all controllers in a global `src/controllers/` directory is forbidden).

---

## 2. Standardized Repository Structure & 6-Layer Core
To maintain absolute predictability and eliminate file bloat, the repository MUST follow the folder layout below. Every module directory under `src/modules/<module-name>/` MUST implement ONLY these 6 core architectural files:

```text
express-template/
├── src/
│   ├── app.ts                 # Express application setup
│   ├── server.ts              # HTTP server listener & bootstrap
│   ├── config/                # Environment variables and DB connections
│   ├── middleware/            # ALL application & module middleware
│   ├── models/                # Database entities (*.model.ts)
│   ├── shared/                # Cross-module assets
│   │   ├── constants/         # Global constants
│   │   ├── schemas/           # Global Zod schemas
│   │   └── errors/            # Global error classes
│   ├── modules/
│   │   └── <module-name>/     # Feature module (e.g., auth)
│   │       ├── <module>.routes.ts
│   │       ├── <module>.controller.ts
│   │       ├── <module>.service.ts
│   │       ├── <module>.repository.ts
│   │       ├── <module>.openapi.ts
│   │       ├── <module>.schemas.ts
│   │       └── <module>.constants.ts (Optional: domain-specific only)
│   └── types/                 # Express and TypeScript ambient definitions
├── tests/                     # Root test directory (No tests inside src/)
│   ├── unit/                  # Mirrors src/modules/ layout
│   │   └── <module-name>/
│   │       ├── <module>.service.test.ts
│   │       └── <module>.controller.test.ts
│   ├── integration/           # Integration & API route tests
│   └── fixtures/              # Mock data and test helpers
└── package.json
```

### Permitted File Exceptions Within Modules

* **`*.constants.ts`**: Permitted inside the module ONLY if values are strictly domain-specific (e.g., `AUTH_JWT_EXPIRATION`).
* **`index.ts`**: Module barrel export file.

### Prohibited Files Within Modules

* **No Unit/Integration Tests:** Do NOT place `*.test.ts` or `*.spec.ts` files inside `src/`. All tests belong in the root `tests/` directory.
* **No Local Middleware:** All reusable or module-bound middleware must reside in `src/middleware/`.
* **No Extra Handlers or Helpers:** Do NOT invent non-standard files (e.g., `auth.handler.ts`). Fold their logic into the 6 core layers.

---

## 3. Centralized Testing Strategy

* All unit, integration, and end-to-end tests MUST reside in the root `tests/` directory to keep `src/` clean.
* Mirror the `src/modules/` structure inside `tests/unit/` for unit testing:
```text
tests/
├── unit/
│   └── auth/
│       ├── auth.service.test.ts
│       └── auth.controller.test.ts
├── integration/
└── fixtures/
```

---

## 4. Single Target Entity & Bounded Contexts

* Each module MUST govern exactly **ONE target entity**.
* **Decouple Auth from Users:** Do NOT mix authentication and user profile management into a single module.
  * `auth` manages identities, credentials, tokens, and login/logout flows.
  * `users` manages user profiles, business roles, and domain-specific user state.
* Do not cross domain boundaries directly in repositories. Services must interact with other domains via explicit service interfaces or shared models.

---

## 5. Schemas, Models, and Validation Separation

* **`*.schemas.ts`**: Reserved strictly for Zod request payload validation schemas inside module folders.
* **Global Zod Schemas:** Reusable, non-entity Zod schemas belong in `src/shared/schemas/`.
* **Database Models:** Database storage layer structures/entities (MongoDB) belong in `src/models/` and must use the `.model.ts` suffix (e.g., `user.model.ts`).

---

## 6. TypeScript, Formatting, and Code Quality

* **Strict Typing:** Always specify explicit TypeScript types for function arguments, return types, and class properties. Use of `any` is strictly prohibited.
* **ESLint Compliance:** All code generated or modified must pass existing ESLint and formatting rules without warning or error bypasses.
* **No Magic Numbers or Hardcoded Strings:** Extract numbers, timeout values, status codes, and message strings into dedicated `*.constants.ts` files or `src/shared/constants/`.
* **Comments for Ambiguity:** Write clear, concise comments explaining the *why* behind complex data transformations, low-level optimizations, or non-obvious algorithms.

---

## 7. RESTful API Design & HTTP Verb Standards

* **State Transitions & Partial Updates:** Endpoints that mutate lifecycle state, publish status, or review stages on an existing entity MUST use the `PATCH` HTTP method, NOT `POST`.
* **Resource Creation:** The `POST` method is reserved exclusively for creating new entities or actions creating distinct independent records.
* **Resource Deletion:** Use `DELETE` strictly for removing resources.
* **Safe / Read Operations:** Use `GET` strictly for idempotent, read-only retrieval without state modifications.
