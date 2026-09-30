# Administrative & Database Utility Scripts

This directory contains standalone CLI scripts for administrative operations, data seeding, and database maintenance in `ittalent-backend`.

---

## Available Scripts

### Enterprise recruiter ownership migration

Run `npm run migrate:enterprise-recruiters` before `npm run migrate:job-posting-enterprises` when upgrading from the legacy `Enterprise.recruiter_ids` model. It assigns each legacy recruiter (and recruiter creator) to `User.enterprise_id`, then removes the legacy field only when every mapping is unambiguous. Conflicts and invalid legacy user records are left intact and reported for manual resolution.

### Application indexes migration

Run `npm run migrate:application-indexes` once on any database created before apply-again (BR-APP-010). The unique `(job_id, applicant_id)` index became a partial index (Withdrawn and Rejected records no longer occupy the pair), and MongoDB will not create an index whose name exists with different options. The script drops indexes that are no longer in the schema and creates the new ones. New databases do not need it.

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
