# FocusFlow & Finance — Production Security Checklist

This document serves as the mandatory pre-launch security sign-off protocol for FocusFlow & Finance. Every item must be verified prior to opening production traffic.

---

## 1. Authentication & Session Integrity

- [x] **Token Cryptographic Verification:** Backend verifies RS256 JWT signatures against Google's public x509 certificates (`https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`).
- [x] **Token Audience & Issuer Checks:** Backend validates that `aud` matches `FIREBASE_PROJECT_ID` and `iss` matches `https://securetoken.google.com/{FIREBASE_PROJECT_ID}`.
- [x] **Clock Skew & Expiration Enforcement:** Strict check on `exp` (with 30s grace) and `iat` (rejecting future-issued tokens > 300s).
- [x] **Production Mandatory Auth:** In production (`REQUIRE_AUTH=true`), unauthenticated requests to `/api` routes are rejected with HTTP 401.
- [x] **Cryptographic Guest Isolation:** Demo/staging sessions use HMAC-SHA256 hashed fingerprints (`x-demo-session`) preventing client impersonation.

---

## 2. Authorization & Multi-Tenant Data Isolation

- [x] **Default Deny Firestore Rules:** Root rule `match /{document=**} { allow read, write: if false; }` prevents any open database reads/writes.
- [x] **Subcollection User Ownership:** Every rule under `/users/{userId}/**` mandates `request.auth.uid == userId`.
- [x] **Cross-Tenant Mutation Prevention:** Server and Firestore verify that payload `userId` equals the authenticated caller ID.
- [x] **Soft-Delete Integrity:** Deleting tasks, transactions, and bills flags `deletedAt` rather than performing destructive hard-deletes.

---

## 3. Network & Transport Security

- [x] **HTTPS Enforcement:** Production traffic redirected to HTTPS; cleartext HTTP rejected.
- [x] **HSTS Header:** `Strict-Transport-Security: max-age=31536000; includeSubDomains` set in production.
- [x] **MIME Sniffing Prevention:** `X-Content-Type-Options: nosniff`.
- [x] **Clickjacking Defense:** `X-Frame-Options: SAMEORIGIN` blocks unauthorized iframe framing.
- [x] **Permissions Policy:** Restricts access to sensitive browser hardware APIs (`camera=(), microphone=(), geolocation=(), payment=()`).
- [x] **Referrer Policy:** `Referrer-Policy: strict-origin-when-cross-origin` protects URI query tokens from leaking.
- [x] **CORS Origin Whitelisting:** [server/security.ts](file:///Users/munshimdatif/Downloads/focusflow-&-finance/server/security.ts) validates `Origin` against `ALLOWED_ORIGINS` and rejects unapproved third-party web domains.

---

## 4. Financial Data Integrity & Input Validation

- [x] **Integer Paise Precision:** All financial calculations strictly operate in integer paise ($1.00 = 100\text{ paise}$), completely avoiding floating-point roundoff errors.
- [x] **Boundary Enforcement:** `MAX_SAFE_PAISE` ($100,000,000.00\text{ INR} = 10^{10}\text{ paise}$) prevents integer overflow.
- [x] **Negative Amount Rejection:** Negative currency inputs are sanitized to zero before processing.
- [x] **Atomic Bill Payments:** Bill payments use batch writes ensuring the bill status, payment history item, expense transaction, and audit log succeed or fail together.
- [x] **Non-Destructive Payment Undo:** Reversing a bill payment changes history status to `reversed` with an audit record rather than deleting historical rows.
- [x] **Idempotent Recurring Bills:** Bills generated from recurring templates use deterministic period keys (`rec_{id}_{YYYY-MM}`), preventing duplicate monthly bills.

---

## 5. API Protection & Denial-of-Service Defense

- [x] **Sliding-Window Rate Limiting:** In-memory sliding window rate limiter throttles excessive requests (300 requests/minute per client IP).
- [x] **Payload Size Limits:** Express JSON body parser strictly capped at `1mb` to prevent memory exhaustion attacks.
- [x] **Error Stack Trace Sanitization:** Production errors return `{ "error": "Internal Server Error" }` without leaking internal file paths or stack traces.

---

## 6. Information Disclosure & Secrets Management

- [x] **Zero AI/LLM Dependencies:** `@google/genai` completely purged from [package.json](file:///Users/munshimdatif/Downloads/focusflow-&-finance/package.json).
- [x] **Sensitive Log Redaction:** `sanitizeLogData` automatically masks passwords, tokens, API keys, credentials, and credit card numbers from stdout/stderr.
- [x] **Git Repository Cleanliness:** No `.env` secrets or private credentials tracked in git.
- [x] **Environment Separation:** Separate staging and production Firebase database IDs.

