# FocusFlow & Finance v1.7.0 — Architecture & Technical Risk Assessment

**Document ID:** `ARCH-RISK-v1.8-v2.0`  
**Target:** Architecture Feasibility, Security Invariants, and Platform Constraints for v1.8 → v2.0  
**Scope:** Vercel Serverless, Cloud Firestore, Web Platform APIs, Data Privacy, and Cryptographic Standards

---

## 1. Core Platform & Runtime Architecture

### 1.1 Vercel Serverless Constraints vs Cloud Firestore
* **Ephemeral Filesystem (`/tmp`)**:
  * Vercel Serverless Functions execute in stateless, short-lived containers with a strictly read-only root filesystem.
  * Local filesystem operations (`/tmp/focusflow-data`) are strictly ephemeral and wiped across container cold starts.
  * **Architectural Rule**: No production feature may treat local disk storage as authoritative. Cloud Firestore is the **only** persistent, durable data store for signed-in users.
  * Local JSON storage must remain purely a developer fallback and offline emulator mode.
* **Cold Starts & Import-Time Side Effects**:
  * Any module that executes synchronous I/O or blocks on external network calls during initialization degrades serverless cold-start latency.
  * All database connections and Admin SDK singletons must be lazy or single-flight initialized (`server/firebaseAdmin.ts`).
* **Connection Pooling**:
  * Serverless functions cannot maintain persistent TCP socket pools across invocations.
  * Firestore Admin SDK and Google API clients use HTTP/2 REST / gRPC transport, which is naturally stateless and serverless-compatible.

---

## 2. Browser Platform APIs Feasibility

### 2.1 Picture-in-Picture (PiP) Floating Focus Timer
* **Browser Compatibility**:
  * Standard `HTMLVideoElement.requestPictureInPicture()` is supported in Chrome, Edge, and Safari.
  * Document Picture-in-Picture API (`window.documentPictureInPicture.requestWindow()`) is supported in Chromium browsers (Chrome 116+) but currently unsupported in Firefox and Safari.
* **Technical Strategy for FocusFlow**:
  * To support all modern browsers, use a hidden `<canvas>` stream routed to an invisible `<video>` element, rendering the live countdown, progress ring, and phase indicator directly onto the canvas.
  * When PIP is triggered: `video.play()` followed by `video.requestPictureInPicture()`.
  * For Chrome 116+, feature-detect `documentPictureInPicture` to render rich interactive controls (Pause, Resume, Skip Break).
* **Feasibility**: **HIGH** (via Canvas-to-Video fallback).

### 2.2 WebAuthn & Biometric Authentication
* **Platform Support**:
  * Supported across modern desktop and mobile browsers via `navigator.credentials.create()` and `navigator.credentials.get()`.
* **Architecture Consideration**:
  * FocusFlow uses Firebase Authentication as its identity provider.
  * Firebase Auth does not natively provide out-of-the-box WebAuthn passkeys without a custom token backend or Firebase Auth Blocking Functions.
  * **Recommended Implementation**: Implement WebAuthn as a **Secondary App Lock / Vault PIN** rather than replacing primary Firebase login. The user signs in via Firebase Auth, and sensitive tabs (Joint Vaults, Finance Settings) can require biometric touch confirmation via WebAuthn credential challenge stored in local IndexedDB.
* **Feasibility**: **MEDIUM** (as application-level re-authentication gate).

---

## 3. Financial Data Integrity, Statement Import & Privacy

### 3.1 CSV / Excel Statement Import & Deduplication
* **Security & Privacy First**:
  * FocusFlow must **never** connect to scraping APIs or store bank login credentials.
  * All bank or UPI statement processing must occur **100% client-side** in the browser using JavaScript streaming parsers.
* **Deduplication Algorithm**:
  * Raw transactions must be hashed using a deterministic SHA-256 fingerprint:
    $$\text{hash} = \text{SHA-256}(\text{Date} + \text{Amount} + \text{Description} + \text{Type})$$
  * When importing a statement, FocusFlow checks existing transaction hashes within a $\pm 2\text{ day}$ window to detect and flag duplicates before committing to Firestore.
* **Feasibility**: **HIGH** (pure client-side parser, zero external API costs).

### 3.2 Floating-Point Rounding & Currency Safety
* **Current Pattern**: Financial quantities are stored as numbers (e.g. `12.50`).
* **Risk**: Standard IEEE 754 floating-point arithmetic introduces rounding drift (e.g. `0.1 + 0.2 = 0.30000000000000004`).
* **Architectural Mandate for v1.8 → v2.0**:
  * All internal financial arithmetic must either store integer amounts in minor currency units (cents/paise):
    $$\text{amountInCents} = \text{Math.round}(\text{amount} \times 100)$$
  * Or use fixed-precision decimal arithmetic helpers before persisting to Firestore.

---

## 4. Cryptographic Standards: AES-256-GCM Backup Encryption

### 4.1 Client-Side Encrypted Backups
* **Requirements**:
  * Users exporting sensitive backups (financial statements, joint vault ledgers, notes) should have the option to encrypt backups with a user password.
* **Standard Implementation (Web Crypto API)**:
  1. Derive a 256-bit key from user passphrase using PBKDF2 with SHA-256 and $\ge 100,000$ iterations and a cryptographically random 16-byte salt:
     $$\text{key} = \text{PBKDF2}(\text{passphrase}, \text{salt}, 100000, 256)$$
  2. Encrypt plaintext JSON using AES-GCM with a random 12-byte initialization vector (IV):
     $$\text{ciphertext} = \text{AES-GCM}(\text{key}, \text{IV}, \text{plaintext})$$
  3. Output bundle format:
     ```json
     {
       "version": "1.0",
       "algorithm": "AES-256-GCM",
       "salt": "base64...",
       "iv": "base64...",
       "ciphertext": "base64..."
     }
     ```
* **Feasibility**: **HIGH** (native browser Web Crypto API, zero server overhead).

---

## 5. Offline-First Synchronization & Conflict Resolution

### 5.1 Outbox Queue & Network Drops
* **Current Foundation**: `src/lib/offlineSync.ts` and `sync_queue` in Firestore.
* **Conflict Resolution Invariant**:
  * For personal entities (Tasks, Habits, Study Topics): Last-Write-Wins (LWW) based on monotonic client timestamps (`updatedAt`).
  * For shared financial entities (Joint Vaults): Server-authoritative atomic transactions (`runTransaction`). Clients cannot use optimistic local overwrite for vault balances; all contributions and shared expenses must execute through backend validation.

---

## 6. Bundle Size, PWA & Performance Budget

### 6.1 Performance Budget Rules
* Current Production Build: Built in $\approx 530\text{ms}$; vendor bundles split into `vendor-firebase`, `vendor-motion`, `vendor-lucide`, and `vendor-react`.
* Max Initial JS Chunk Budget: $< 500\text{ kB}$ uncompressed.
* Feature modules (Theme Studio, Export Center, Joint Vaults, Sheet Hub) must remain lazy-loaded via `React.lazy()` to maintain instant initial page load on mobile viewports.

