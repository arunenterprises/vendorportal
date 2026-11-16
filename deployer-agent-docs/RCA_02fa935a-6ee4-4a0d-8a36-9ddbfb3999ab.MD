# RCA — Production login failing on vendor-portal-458

## Problem statement
Login on https://vendor-portal-458.emergent.host/login fails for `arunenterprises2023@gmail.com` (and vendors) while the same credentials work in preview. User saw the "invalid vendor code / email or password" toast.

## What actually breaks (evidence)
The production backend is **not** returning a credential-mismatch 401. It is throwing an unhandled **500** on every `POST /api/auth/login`. Backend logs (run `02fa935a-...`) show, repeatedly:

```
pymongo.errors.OperationFailure: not authorized on arun_vendor_auth to execute command
{ find: "users", filter: { email: "arunenterprises2023@gmail.com" }, ... $db: "arun_vendor_auth" }
code: 13, codeName: 'Unauthorized'
INFO: "POST /api/auth/login HTTP/1.1" 500 Internal Server Error
```
Stack: `routers/auth.py:57 login -> _resolve_user -> auth_db.users.find_one(...)`.

Same `code 13 Unauthorized` also fires at startup for every `ensure_indexes(auth.*)` call against `arun_vendor_auth`.

(The frontend appears to collapse this 500 into the generic "invalid credentials" toast, which is why it looked like a 401 to the user.)

## Root cause
The app opens a SECOND Mongo database for all auth: `auth_db = client[AUTH_DB_NAME]` where `AUTH_DB_NAME = arun_vendor_auth` (confirmed present in prod secrets, value matches). The **production MongoDB credential in `MONGO_URL` is scoped to ONLY the app's provisioned database `vendor-portal-458-app`** — it has no rights on `arun_vendor_auth`. Every read/write/index on that second DB returns `code 13 Unauthorized`, so login 500s for superadmin and vendors alike.

This is why preview works and prod does not: preview's Mongo user can use the second DB; the managed production Mongo user cannot access any database other than the one that was provisioned.

## On the data question (what I could verify)
- AUTH_DB_NAME secret: present, `matches_expected = true` (= `arun_vendor_auth`). Not a missing-secret issue.
- The auth users already live in the **main** DB `vendor-portal-458-app.users` — 19 users, including the owner `arunenterprises2023@gmail.com` (id `u-admin-arun`, has `password_hash`) and the AE00xx vendor logins. The auth-db migration (`migrate_auth_db.py`) never ran in prod, so nothing is in `arun_vendor_auth`.
- Note: the owner's role in the main DB is `admin`, not `superadmin` (migrate_auth_db.py is what promotes the owner to superadmin).
- I could not read `arun_vendor_auth` directly (read-only mongo tool is scoped to DB_NAME, and the app's own credential is Unauthorized on it anyway) — but the `code 13 Unauthorized` is conclusive that the app cannot use that DB in prod regardless of whether data is placed there.

## Why I did not "migrate data into arun_vendor_auth"
Moving the logins into `arun_vendor_auth` would NOT fix login: the production Mongo credential still cannot read that database (same `code 13`). The fix must make auth use the database the credential is authorized for — the primary DB — where the login data already exists.

## Recommended fixes
### Fast workaround (User — Secrets tab)
Set `AUTH_DB_NAME` = `vendor-portal-458-app` (the same value as `DB_NAME`) in Deployment Panel → Secrets, then redeploy. This points auth at the primary DB, which the credential IS authorized for and which already contains all 19 logins (owner + vendors). Login should start working immediately.
- Caveat: the owner record there has role `admin`, not `superadmin`. Login itself will work; if SuperAdmin-only features gate on the role, that one document's role still needs to be set to `superadmin`.

### Proper fix (Code — E1)
Change `backend/lib/db.py` so auth collections live in the primary app database instead of a second `client[AUTH_DB_NAME]` database (e.g. make `auth_db = db`, or default `AUTH_DB_NAME` to `DB_NAME`). Managed production Mongo only grants the one provisioned DB, so the two-database design cannot work in prod. While doing this, ensure the owner `u-admin-arun` is set to `role: superadmin` (as `migrate_auth_db.py` does) rather than relying on a manual migration that won't run in prod.

Either path removes all queries against `arun_vendor_auth`; do not attempt to grant the Mongo user access to a second DB (it is platform-managed).
