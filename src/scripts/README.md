# Administrative & Database Utility Scripts

This directory contains standalone CLI scripts for administrative operations, data seeding, and database maintenance in `ittalent-backend`.

---

## Available Scripts

### 1. Seed Admin Account (`seed-admin.ts`)

Provisions a new administrator account or promotes an existing account to active `admin` status with updated local credentials.

#### Execution

**Using Default Credentials:**
```bash
npm run seed:admin
```
*Defaults:*
- **Email:** `admin@example.com`
- **Username:** `admin`
- **Password:** `Admin123456!`

**Using Environment Variables (Inline):**
```bash
ADMIN_EMAIL=superadmin@example.com \
ADMIN_USERNAME=superadmin \
ADMIN_PASSWORD=MySecurePassword123! \
npm run seed:admin
```

**Using `.env` File:**
Add the following entries to your root `.env` file:
```dotenv
ADMIN_EMAIL=admin@example.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin123456!
```
Then run:
```bash
npm run seed:admin
```

#### Behavior & Idempotency
- **Fresh Account:** If no user exists with the provided email, a new `User` document is created with `role: 'admin'` and `status: 'active'`, along with a local `Account` document storing the bcrypt-hashed password.
- **Existing Account:** If the user already exists, their `role` is promoted to `'admin'`, their `status` is set to `'active'`, and their local password hash is updated.
- **Collision Protection:** If the desired username is already taken by a different email address, the script aborts with an error without modifying data.
- **Idempotent:** Safe to run repeatedly in deployment pipelines or local development without duplicate accounts.

### 2. Seed Applications Data (`seed-applications.ts`)

Creates a candidate user and seed minimal application data for development and testing.

#### Execution

**Using Default Values:**
```bash
npm run seed:applications
```
Creates a demo candidate (`candidate-myapps@example.com` / `Candidate123!`) and fourteen applications covering every status (submitted, under review, interviewing, offered, hired, rejected, withdrawn, position filled), a BR-APP-008 withdrawn/reapplication pair, and a withdrawn record that can be applied for again. Each has attachments and an append-only status history.

#### Extra accounts and reset
Also creates `candidate-empty@example.com` (no applications, for the empty state) and `candidate-other@example.com` (owns one application the demo candidate must never see). All use the same password. Set `SEED_RESET=true` to delete these candidates' applications before seeding, which the end-to-end suite uses for a clean, deterministic start.

#### Behavior & Idempotency
- **Fresh Candidate:** If no user exists with `candidate-myapps@example.com`, a new `User` document is created with `role: 'user'` and `status: 'active'`.
- **Existing Candidate:** Reuses the existing candidate user; no changes to the account.
- **Applications:** For each seeded job ID, inserts an application if none exists for that candidate/job pair (unique index enforced).
- **Idempotent:** Safe to run repeatedly; only missing applications are created.

### 3. Sync Application Indexes (`sync-application-indexes.ts`)

```bash
npm run migrate:application-indexes
```
BR-APP-008 changed the `(applicant_id, job_id)` unique index to a partial index (Withdrawn records no longer occupy the pair). Run this once on any database created before that change; it drops indexes that are no longer in the schema and creates the new ones. New databases do not need it.

---

## Adding New Scripts

When adding new scripts to this directory:
1. Load environment variables via `import 'dotenv/config';`.
2. Connect to MongoDB using `connectDatabase()` and always disconnect cleanly in a `finally` block using `disconnectDatabase()` from `../config/db.js`.
3. Export the core logic as a typed function (e.g. `export async function myScript(): Promise<...>` ) so it can be tested in Vitest.
4. Auto-invoke the script only when executed directly:
   ```typescript
   const isDirectRun =
     process.argv[1]?.endsWith('my-script.ts') ||
     process.argv[1]?.endsWith('my-script.js');

   if (isDirectRun) {
     main().catch((error) => {
       console.error(error);
       process.exit(1);
     });
   }
   ```
5. Register corresponding npm script in `package.json` under `"scripts"` (e.g. `"my-script": "tsx src/scripts/my-script.ts"`).
