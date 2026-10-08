# RS Staffing API — guide for frontend and mobile

The contract is `openapi.json` (OpenAPI 3.1), generated from the same zod schemas that validate
requests. Every backend build publishes it (CI artifact and GitHub Release asset). Generate a typed
client from it; don't hand-write request or response types.

Base URL: `https://api.<env>` (local: `http://localhost:3000`). All bodies are JSON.

## Signing in (phone OTP)

There is no self sign-up: HQ creates every user. Better Auth handles the OTP; its endpoints live
under `/api/auth/*` and answer in **Better Auth's own error format** (`{ "message", "code" }`),
not the API's error shape below.

**1. Ask for a code.** The reply is the same whether or not the number belongs to a user.

```http
POST /api/auth/phone-number/send-otp
Content-Type: application/json

{ "phoneNumber": "+919000000001" }
```

```json
200 { "message": "code sent" }
400 { "message": "Invalid phone number", "code": "INVALID_PHONE_NUMBER" }
```

Numbers are E.164 Indian mobiles: `+91` and 10 digits starting 6–9. The code is 6 digits, valid
for 5 minutes, 3 attempts. Sends are rate-limited (per number and per IP); a limited request gets
the same `200` and no SMS. In development the code is printed to the API's console.

**2. Verify it.**

```http
POST /api/auth/phone-number/verify
Content-Type: application/json

{ "phoneNumber": "+919000000001", "code": "061682" }
```

```json
200 {
  "status": true,
  "token": "7pbH88Ig…",
  "user": { "id": "8d9dddce-…", "name": "Asha Verma", "phoneNumber": "+919000000001", "phoneNumberVerified": true, … }
}
400 { "message": "Invalid OTP", "code": "INVALID_OTP" }
```

The response sets a session in two ways; use one:

| | How | When |
|---|---|---|
| Cookie | `Set-Cookie: better-auth.session_token=…; HttpOnly; SameSite=Lax` | Web app on the same site as the API (send `credentials: 'include'`) |
| Bearer | `set-auth-token: <token>` response header (also `token` in the body) | A frontend on another domain, mobile; send `Authorization: Bearer <token>` |

Sessions last 12 hours and are refreshed while in use. Sign out: `POST /api/auth/sign-out`.

**3. Who am I.** `GET /me` returns the user, their role, their permission keys (drive menus from
these) and, for supervisors, the sites they cover:

```json
200 {
  "id": "01a11c41-…", "name": "Suresh Patel", "role": "SUPERVISOR", "employeeId": "…",
  "siteIds": ["…", "…", "…"],
  "permissions": ["sites.read", "employees.read", "attendance.read", "attendance.write", "…"],
  "siteScopes": [{ "siteId": "…", "siteCode": "NTX-BPL", "siteName": "Narmada Textiles — Bhopal Mill", "effectiveFrom": "2026-04-01", "effectiveTo": null }]
}
```

A supervisor's permissions apply only to their sites; an employee's only to their own record.

## Value lists

`GET /lookups` returns every enum the API accepts or returns (`enums.Role`, `enums.DayCode`,
`enums.PaymentMode`, … each a list of `{ value, label }`), the states, all permission keys and the
statutory rule codes. Fetch it once per session; never hard-code these lists.

## Errors

Every error from the API (everything outside `/api/auth/*`) has one shape:

```json
{ "error": { "code": "MAKER_CHECKER", "message": "The approver cannot be the person who made the change", "details": null, "requestId": "c921811c-…" } }
```

- Branch on `code`; show `message` to the user; quote `requestId` in bug reports (it is also the
  `x-request-id` response header).
- `details` is `null` or code-specific: field errors for `VALIDATION_FAILED`, the constraint or
  fields for database conflicts, the affected rows for `RULES_UNVERIFIED`.

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `UNAUTHENTICATED` | No session, an expired one, or the account is disabled, locked or past its expiry |
| 403 | `FORBIDDEN` | Your role can't do this |
| 404 | `NOT_FOUND` | No such record, **or** it is outside your reach (a supervisor asking for another site's data gets exactly this, so ids can't be probed) |
| 409 | `DUPLICATE` | A unique value already exists; `details.fields` names the field(s) |
| 409 | `OVERLAP` | The dates overlap an existing record (deployments, site scopes, rules…) |
| 409 | `IN_USE` | The record is still referenced elsewhere |
| 409 | `REFERENCE_MISSING` | A linked record (e.g. `siteId`) doesn't exist |
| 409 | `ALREADY_APPROVED` | The item was already approved |
| 409 | `SCOPE_ENDED` | The site scope has already ended |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | Another request with the same `Idempotency-Key` is still running; retry shortly |
| 422 | `VALIDATION_FAILED` | The request failed validation; `details` = `[{ "path", "message" }]` |
| 422 | `INVALID_VALUE` | A value isn't one of the allowed options (see `/lookups`) |
| 422 | `MAKER_CHECKER` | The approver (or locker) can't be the person who made (or computed) it |
| 422 | `ACK_REQUIRED` | Upload the acknowledgement photo before marking cash paid |
| 422 | `RULE_VIOLATED` | The change breaks a data rule |
| 422 | `LAST_ADMIN` | At least one active Admin must remain |
| 422 | `SELF_DISABLE` | You can't disable your own account |
| 422 | `EMPLOYEE_REQUIRED` | Supervisor and employee logins must be linked to an employee |
| 422 | `NOT_A_SUPERVISOR` | Site scopes can only be given to supervisors |
| 422 | `SITE_INACTIVE` | The site isn't active |
| 422 | `RULES_UNVERIFIED` | (Production) the run uses rule rows still marked VERIFY |
| 422 | `IDEMPOTENCY_KEY_REQUIRED` | This POST needs an `Idempotency-Key` header |
| 422 | `IDEMPOTENCY_KEY_REUSED` | That key was already used with a different request body |
| 429 | `RATE_LIMITED` | Too many attempts; retry later |
| 4xx | `HTTP_ERROR` | A malformed HTTP request (e.g. invalid JSON) |
| 500 | `INTERNAL` | Our fault; the message is generic, the `requestId` finds it in the logs |

New codes are added to this table in the same PR that introduces them.

## Lists and pagination

Lists return `{ "items": [...], "nextCursor": "…" | null }`. Pass `?cursor=<nextCursor>` (and
optionally `limit`, 1–100, default 50) for the next page; `nextCursor: null` means the end. Cursors
are opaque (today a uuid v7); don't parse them. Filters are query parameters documented per route.

## Money, dates, ids

- **Money is integer paise, sent and received as a string**: `"1655000"` is ₹16,550.00. Never use
  floats; to display, insert the decimal point two places from the right and group Indian-style
  (`₹16,550.00`). The API does every calculation; the client never adds, rounds or recomputes.
- **Rates** are percent strings with up to 4 decimals: `"12"`, `"8.33"`, `"0.75"`.
- **Dates** are ISO `YYYY-MM-DD` (a calendar date, no time zone); **timestamps** are ISO 8601 UTC
  (`2026-10-08T16:02:06.080Z`); show them in IST. Wage months are `YYYY-MM`.
- **Ids** are uuid v7 strings. Human codes (`RS000001`, `DW00001`) are separate fields and never reused.

## Idempotency keys

POSTs that create money records (payroll runs, cash releases, payouts, payments, advances…) are
marked in `openapi.json` with an `idempotency-key` header. For those, send
`Idempotency-Key: <8–100 chars>`, generated once per logical operation (a uuid is fine) and reused
on every retry of that operation:

- The first request runs normally; its response is stored with the key.
- A retry with the same key and the same body returns the stored response (with
  `idempotent-replayed: true`) and changes nothing.
- The same key with a different body → 422 `IDEMPOTENCY_KEY_REUSED`; no key → 422
  `IDEMPOTENCY_KEY_REQUIRED`.

Keys are per user.

## Headers

| Header | Direction | |
|---|---|---|
| `Authorization: Bearer <token>` | request | Bearer sessions |
| `Idempotency-Key` | request | Money-creating POSTs |
| `x-request-id` | both | Send your own to correlate; otherwise the API assigns one |
| `set-auth-token` | response | Session token after verify |
| `idempotent-replayed` | response | `true` on a replayed response |

CORS allows only the configured frontend origins (`WEB_ORIGIN`, comma-separated).
