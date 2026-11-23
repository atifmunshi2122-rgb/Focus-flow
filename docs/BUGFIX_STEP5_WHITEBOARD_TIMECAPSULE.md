# BUGFIX STEP 5: Whiteboard Canvas & Time Capsule Bugfixes

## Overview
In FocusFlow & Finance v1.8.0, an exhaustive audit of the **Rough-Work Whiteboard Canvas** (`src/components/study/WhiteboardCanvas.tsx`) and **Time Capsule Letters to Future Self** (`src/components/productivity/TimeCapsuleView.tsx`) identified critical functional defects, coordinate scaling inaccuracies, and security vulnerabilities:
1. **Whiteboard Canvas Clear Glitch**: Calling `handleClear` previously called `handleResize()`, which copied the current canvas into an offscreen buffer and then re-drew that buffer back onto the canvas—restoring the exact drawing that was supposed to be erased.
2. **Mobile / High-DPR Coordinate Misalignment**: Coordinate calculation lacked scaling relative to canvas backing dimensions (`(canvas.width / rect.width)`), causing pen strokes to drift or miss on mobile devices, high-DPI displays, and responsive flex layouts.
3. **Unchecked Whiteboard Save**: Remote saving was unawaited and swallowed errors, displaying false success toasts even when offline or when cloud sync failed.
4. **Misleading Cryptographic Claims**: Base64 encoding was described as "tamper-proof" or "encrypted". Hardcoded seed letters masked the empty state for new users.
5. **Client-Trusted Time Capsule Unlocks**: The server trusted client-provided `isUnlocked` boolean flags and returned the full un-redacted content of locked letters over GET endpoints before their scheduled unlock dates.

Step 5 completely resolves these issues across client components, coordinate helpers, API clients, and server routes.

---

## PART A — Whiteboard Canvas

### 1. Dedicated Blank-Canvas Rendering & True Clear
- **Root Cause**: `handleResize` preserved existing pixels in an offscreen buffer canvas (`bufferCanvasRef`) and automatically redrew them on the screen. Because `handleClear` invoked `handleResize`, the erased drawing was immediately redrawn.
- **Solution**:
  - Implemented `renderBlankCanvas(ctx, width, height)`:
    - Fills canvas with dark slate background (`#0f172a`).
    - Draws an engineering dot-grid without restoring any buffered content.
  - In `handleClear()`:
    1. Saves the active drawing to `undoStackRef.current` so the user can easily undo an accidental clear.
    2. Resets `bufferCanvasRef.current` dimensions (`width = 0`, `height = 0`) to guarantee that subsequent window resizes will not resurrect the erased drawing.
    3. Calls `renderBlankCanvas(ctx, canvas.width, canvas.height)`.
    4. Updates undo/redo button states (`canUndo = true`, `canRedo = false`).
  - Pressing **Undo** restores the erased drawing; pressing **Redo** re-clears the canvas.

### 2. Pointer Events & Mobile Backing Coordinate Accuracy
- **Shared Normalizer**: Implemented `getCanvasCoordinates(clientX, clientY, canvas)`:
  ```ts
  export function getCanvasCoordinates(
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.round((clientX - rect.left) * scaleX),
      y: Math.round((clientY - rect.top) * scaleY),
    };
  }
  ```
- **Pointer Events Integration**: Replaced fragmented `MouseEvent` / `TouchEvent` handlers with unified HTML5 Pointer Events (`onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel`, `onPointerLeave`).
- **Touch Action & Pointer Capture**:
  - Applied `touch-action: none` / `touch-none` to prevent mobile browsers from triggering pinch/zoom/scroll gestures during drawing.
  - Invoked `setPointerCapture(pointerId)` on pointer down and `releasePointerCapture(pointerId)` on pointer up to prevent stroke loss when gesturing near canvas boundaries.

### 3. Resilient Remote Save with Local Fallback & Retry
- **Local Preservation First**: Before issuing any network request, the drawing DataURL is saved to local storage (`localStorage.setItem(storageKey, dataUrl)`), ensuring user sketches are never lost during sudden network drops.
- **Awaited Server Confirmation**: The save handler now awaits `api.saveWhiteboardDrawing(...)`.
- **Accurate Status Feedback**:
  - When cloud sync succeeds: displays `"Whiteboard saved and attached to <Topic> successfully!"`.
  - When cloud sync fails: displays `"Saved on this device — sync pending/failed: <error>"` accompanied by an active **Retry Sync** button.
- **Topic Linkage**: Verifies that `topicId` and `topicTitle` are linked to the selected study topic.

---

## PART B — Time Capsule

### 4. Honest Representations & Genuine Empty State
- **Removed False Claims**: Stripped terms such as "tamper-proof", "cryptographic vault", and "encrypted". Accurately describes time capsules as **"Date-restricted personal reminders"** sealed until a designated future date.
- **Removed Mock Seed Letters**: Removed `SEED_CAPSULES` from production views. New users see a genuine empty state guiding them to seal their first letter.
- **Unswallowed API Errors**: Form submission and deletion now properly capture API errors and display user-facing alert banners with retry actions.

### 5. Server-Enforced Unlock Rules & Content Redaction
- **Trusted Server Time**: Unlock status is computed server-side using `getTodayDateString(tz)` (never client system clocks):
  ```ts
  function isTimeCapsuleUnlockedOnServer(capsule: { unlockDate?: string }, serverToday: string): boolean {
    if (!capsule.unlockDate) return true;
    return capsule.unlockDate <= serverToday;
  }
  ```
- **Strict Content Redaction for Locked Letters**:
  - If `isUnlocked` is false (target date is in the future), `GET /time-capsules` and `GET /time-capsules/:id` strictly redact `content: ''`.
  - Only safe metadata (`id`, `userId`, `title`, `unlockDate`, `isUnlocked: false`, `isSealed: true`, `sealedAt`, `createdAt`, `tags`) is returned over the wire.
- **Immunity to Client Manipulation**:
  - `POST /time-capsules` ignores client `body.isUnlocked` and forces `isUnlocked: false` if `unlockDate > serverToday`.
  - `PUT /time-capsules/:id` rejects attempts to prematurely force `isUnlocked: true` for future letters.
  - Cross-user reads, updates, and deletes are rejected with 403 or non-disclosing 404 responses.

---

## Verification & Test Results

### 1. Dedicated Step 5 Test Suite (`test/v1_8_whiteboard_timecapsule.test.ts`)
* **Whiteboard Canvas (8 tests)**:
  * 1:1 coordinate backing calculation.
  * Mobile DPR / CSS flex scaling coordinate accuracy.
  * Zero-dimension edge case safety.
  * `renderBlankCanvas` background and dot grid verification.
  * Buffer clearing preventing resize restoration.
  * Remote save with `topicId` and `topicTitle` linkage.
  * Rejection of malformed/oversized `dataUrl`.
  * User A vs User B drawing isolation.
* **Time Capsule Security & Unlocks (13 tests)**:
  * Genuine empty state for new users (0 seed letters).
  * Future letter creation enforces `isUnlocked: false` and redacts content.
  * `GET /time-capsules` redacts locked letter content.
  * `GET /time-capsules/:id` redacts locked letter content.
  * Client manipulated `POST /time-capsules` with `isUnlocked: true` is overridden by server.
  * Client manipulated `PUT /time-capsules/:id` with `isUnlocked: true` is overridden by server.
  * Past/current letters unlock immediately with full content.
  * `GET /time-capsules/:id` returns full content once unlocked.
  * User B cannot read User A's letter (403/404).
  * User B cannot update User A's letter (403/404).
  * User B cannot delete User A's letter (403/404).
  * POST validation (missing title/content returns 400).
  * DELETE nonexistent capsule returns 404.
  * `revealContent` displays locked notice when content is sealed/redacted.

**Result: 21 passed, 0 failed.**

### 2. Full Regression Suite
* `npm run typecheck`: **0 errors**.
* `npm run build:prod`: **Clean production build in 560ms**.
* All 136 Step 1–5 tests passed cleanly with 0 errors.

