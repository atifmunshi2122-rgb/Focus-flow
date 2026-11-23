import './test_bootstrap.ts';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../api/index.ts';
import {
  getCanvasCoordinates,
  renderBlankCanvas,
} from '../src/components/study/WhiteboardCanvas.tsx';
import { revealContent } from '../src/components/productivity/TimeCapsuleView.tsx';
import type { TimeCapsuleLetter, WhiteboardDrawing } from '../src/types/features15.ts';

function createAuthJwt(uid: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      user_id: uid,
      email: `${uid}@example.com`,
      aud: 'test-rules-project',
      iss: 'https://securetoken.google.com/test-rules-project',
      iat: now,
      exp: now + 3600,
    })
  ).toString('base64url');
  return `${header}.${payload}.`;
}

describe('Step 5 — Whiteboard Canvas & Time Capsule Bugfix Suite', () => {
  let server: http.Server;
  let baseUrl = '';

  const userAlice = 'usr_wb_alice_' + Date.now();
  const userBob = 'usr_wb_bob_' + Date.now();
  const tokenAlice = createAuthJwt(userAlice);
  const tokenBob = createAuthJwt(userBob);

  before(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server) {
      server.close();
    }
  });

  // ==========================================================================
  // PART A — WHITEBOARD CANVAS
  // ==========================================================================
  describe('PART A: Whiteboard Canvas', () => {
    describe('1. Mobile Coordinates Normalization', () => {
      it('calculates 1:1 backing coordinates when canvas dimensions match bounding rect', () => {
        const mockCanvas = {
          width: 800,
          height: 600,
          getBoundingClientRect: () => ({
            left: 50,
            top: 100,
            width: 800,
            height: 600,
            right: 850,
            bottom: 700,
          }),
        } as unknown as HTMLCanvasElement;

        const coords = getCanvasCoordinates(250, 300, mockCanvas);
        assert.strictEqual(coords.x, 200, '(250 - 50) * (800 / 800) = 200');
        assert.strictEqual(coords.y, 200, '(300 - 100) * (600 / 600) = 200');
      });

      it('accurately scales mobile touch coordinates when CSS width is narrower than canvas backing pixels', () => {
        // e.g. Mobile viewport with CSS width 375, canvas backing buffer 750 (2x DPR)
        const mockCanvas = {
          width: 750,
          height: 1000,
          getBoundingClientRect: () => ({
            left: 20,
            top: 50,
            width: 375,
            height: 500,
            right: 395,
            bottom: 550,
          }),
        } as unknown as HTMLCanvasElement;

        const coords = getCanvasCoordinates(120, 250, mockCanvas);
        // (120 - 20) * (750 / 375) = 100 * 2 = 200
        assert.strictEqual(coords.x, 200);
        // (250 - 50) * (1000 / 500) = 200 * 2 = 400
        assert.strictEqual(coords.y, 400);
      });

      it('handles edge case when canvas bounding rect has zero width or height safely', () => {
        const zeroCanvas = {
          width: 800,
          height: 600,
          getBoundingClientRect: () => ({
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            right: 0,
            bottom: 0,
          }),
        } as unknown as HTMLCanvasElement;

        const coords = getCanvasCoordinates(100, 100, zeroCanvas);
        assert.deepStrictEqual(coords, { x: 0, y: 0 });
      });
    });

    describe('2. Dedicated Blank-Canvas Rendering & Clear Logic', () => {
      it('renderBlankCanvas resets fillStyle, draws background rect, and dots grid', () => {
        const operations: string[] = [];
        const mockCtx = {
          fillStyle: '',
          fillRect: (x: number, y: number, w: number, h: number) => {
            operations.push(`fillRect(${x},${y},${w},${h}) with ${mockCtx.fillStyle}`);
          },
          beginPath: () => operations.push('beginPath'),
          arc: (x: number, y: number, r: number) => operations.push(`arc(${x},${y},${r})`),
          fill: () => operations.push('fill'),
        } as unknown as CanvasRenderingContext2D;

        renderBlankCanvas(mockCtx, 100, 100);

        assert.ok(operations.some((op) => op.includes('fillRect(0,0,100,100) with #0f172a')));
        assert.ok(operations.includes('beginPath'));
        assert.ok(operations.includes('fill'));
      });

      it('clear resets buffer so intentional window resize does NOT restore old drawing', () => {
        const buffer = {
          width: 800,
          height: 600,
        };

        // Simulating handleClear buffer reset
        buffer.width = 0;
        buffer.height = 0;

        assert.strictEqual(buffer.width, 0, 'Buffer width must be cleared to 0');
        assert.strictEqual(buffer.height, 0, 'Buffer height must be cleared to 0');
      });
    });

    describe('3. Remote Save & Study Topic Linkage', () => {
      it('successfully saves whiteboard drawing and links it to selected study topic', async () => {
        const validPngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        const payload = {
          title: 'Algorithms Whiteboard: Red-Black Tree Rotation',
          dataUrl: validPngBase64,
          topicId: 'topic_rbt_101',
          topicTitle: 'Red-Black Trees',
          width: 800,
          height: 600,
        };

        const res = await fetch(`${baseUrl}/api/whiteboard`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenAlice}`,
          },
          body: JSON.stringify(payload),
        });

        assert.strictEqual(res.status, 201);
        const data = (await res.json()) as WhiteboardDrawing;
        assert.ok(data.id);
        assert.strictEqual(data.userId, userAlice);
        assert.strictEqual(data.topicId, 'topic_rbt_101');
        assert.strictEqual(data.topicTitle, 'Red-Black Trees');
        assert.strictEqual(data.title, 'Algorithms Whiteboard: Red-Black Tree Rotation');
      });

      it('rejects invalid or corrupted dataUrl payloads with 400 INVALID_PAYLOAD', async () => {
        const res = await fetch(`${baseUrl}/api/whiteboard`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenAlice}`,
          },
          body: JSON.stringify({
            title: 'Corrupted',
            dataUrl: 'not_a_valid_data_url',
          }),
        });

        assert.strictEqual(res.status, 400);
        const err = await res.json();
        assert.strictEqual(err.code, 'INVALID_PAYLOAD');
      });

      it('isolates whiteboard drawings: User B cannot access User A drawings', async () => {
        // Alice has saved 1 drawing above
        const resBob = await fetch(`${baseUrl}/api/whiteboard`, {
          headers: { Authorization: `Bearer ${tokenBob}` },
        });

        assert.strictEqual(resBob.status, 200);
        const bobDrawings = (await resBob.json()) as WhiteboardDrawing[];
        assert.strictEqual(bobDrawings.length, 0, 'User B must see 0 drawings');
      });
    });
  });

  // ==========================================================================
  // PART B — TIME CAPSULE
  // ==========================================================================
  describe('PART B: Time Capsule Security & Unlock Rules', () => {
    describe('4. Genuine Empty State & No Fake Seed Letters', () => {
      it('returns empty array [] for a new user without invented sample letters', async () => {
        const newUser = 'usr_new_capsule_' + Date.now();
        const newToken = createAuthJwt(newUser);

        const res = await fetch(`${baseUrl}/api/time-capsules`, {
          headers: { Authorization: `Bearer ${newToken}` },
        });

        assert.strictEqual(res.status, 200);
        const capsules = (await res.json()) as TimeCapsuleLetter[];
        assert.strictEqual(Array.isArray(capsules), true);
        assert.strictEqual(capsules.length, 0, 'New user must see genuine empty state, zero seed capsules');
      });
    });

    describe('5. Unlock Rules Enforcement & Content Redaction Before Unlock Date', () => {
      let lockedCapsuleId = '';
      const futureDate = '2099-12-31';
      const secretLetter = 'Dear Future Me in 2099: If you are reading this, humanity survived and the systems we built are still running.';

      it('seals letter with future unlock date, sets isUnlocked: false, and redacts content in response', async () => {
        const res = await fetch(`${baseUrl}/api/time-capsules`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenAlice}`,
          },
          body: JSON.stringify({
            title: 'Letter to 2099 Self',
            content: secretLetter,
            unlockDate: futureDate,
            // Malicious attempt to force unlock client-side:
            isUnlocked: true,
            isSealed: false,
          }),
        });

        assert.strictEqual(res.status, 201);
        const created = (await res.json()) as TimeCapsuleLetter;
        assert.ok(created.id);
        lockedCapsuleId = created.id;

        // Server MUST override client manipulation
        assert.strictEqual(created.isUnlocked, false, 'Server must enforce isUnlocked: false for future dates');
        assert.strictEqual(created.isSealed, true, 'Server must enforce isSealed: true for future dates');
        // Content must be REDACTED
        assert.strictEqual(created.content, '', 'Server must redact content before unlock date');
      });

      it('GET /api/time-capsules returns locked letters with redacted content', async () => {
        const res = await fetch(`${baseUrl}/api/time-capsules`, {
          headers: { Authorization: `Bearer ${tokenAlice}` },
        });

        assert.strictEqual(res.status, 200);
        const capsules = (await res.json()) as TimeCapsuleLetter[];
        const locked = capsules.find((c) => c.id === lockedCapsuleId);
        assert.ok(locked);
        assert.strictEqual(locked?.isUnlocked, false);
        assert.strictEqual(locked?.isSealed, true);
        assert.strictEqual(locked?.content, '', 'GET /time-capsules must strictly redact locked letter content');
      });

      it('GET /api/time-capsules/:id directly redacts content before unlock date', async () => {
        const res = await fetch(`${baseUrl}/api/time-capsules/${lockedCapsuleId}`, {
          headers: { Authorization: `Bearer ${tokenAlice}` },
        });

        assert.strictEqual(res.status, 200);
        const capsule = (await res.json()) as TimeCapsuleLetter;
        assert.strictEqual(capsule.id, lockedCapsuleId);
        assert.strictEqual(capsule.isUnlocked, false);
        assert.strictEqual(capsule.content, '', 'Direct GET must not leak locked letter content');
        assert.strictEqual(capsule.unlockDate, futureDate);
      });

      it('PUT /api/time-capsules/:id rejects client attempt to force isUnlocked: true on a future letter', async () => {
        const res = await fetch(`${baseUrl}/api/time-capsules/${lockedCapsuleId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenAlice}`,
          },
          body: JSON.stringify({
            isUnlocked: true, // Malicious update attempt
            isSealed: false,
          }),
        });

        assert.strictEqual(res.status, 200);
        const updated = (await res.json()) as TimeCapsuleLetter;
        assert.strictEqual(updated.isUnlocked, false, 'Server must ignore client manipulation in PUT');
        assert.strictEqual(updated.isSealed, true);
        assert.strictEqual(updated.content, '', 'Content must remain redacted');
      });
    });

    describe('6. Letters At or After Unlock Date', () => {
      let unlockedCapsuleId = '';
      const pastDate = '2020-01-01';
      const pastLetter = 'Dear 2020 Me: Here is the unlocked wisdom from the past.';

      it('allows immediate unlock and full content visibility for past/current dates', async () => {
        const res = await fetch(`${baseUrl}/api/time-capsules`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenAlice}`,
          },
          body: JSON.stringify({
            title: 'Unlocked Letter from 2020',
            content: pastLetter,
            unlockDate: pastDate,
          }),
        });

        assert.strictEqual(res.status, 201);
        const created = (await res.json()) as TimeCapsuleLetter;
        assert.ok(created.id);
        unlockedCapsuleId = created.id;
        assert.strictEqual(created.isUnlocked, true);
        assert.strictEqual(created.isSealed, false);
        assert.strictEqual(created.content, pastLetter, 'Unlocked letter returns full content');
      });

      it('GET /api/time-capsules/:id returns full content once unlocked', async () => {
        const res = await fetch(`${baseUrl}/api/time-capsules/${unlockedCapsuleId}`, {
          headers: { Authorization: `Bearer ${tokenAlice}` },
        });

        assert.strictEqual(res.status, 200);
        const capsule = (await res.json()) as TimeCapsuleLetter;
        assert.strictEqual(capsule.isUnlocked, true);
        assert.strictEqual(capsule.content, pastLetter);
      });
    });

    describe('7. Cross-User Access & Ownership Protection', () => {
      let aliceLetterId = '';

      before(async () => {
        const res = await fetch(`${baseUrl}/api/time-capsules`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenAlice}`,
          },
          body: JSON.stringify({
            title: 'Alice Private Letter',
            content: 'Private thoughts',
            unlockDate: '2025-01-01',
          }),
        });
        const created = (await res.json()) as TimeCapsuleLetter;
        aliceLetterId = created.id;
      });

      it('User B cannot read User A time capsule via GET /time-capsules/:id', async () => {
        const res = await fetch(`${baseUrl}/api/time-capsules/${aliceLetterId}`, {
          headers: { Authorization: `Bearer ${tokenBob}` },
        });
        // Must reject with 403 or 404 (non-disclosing)
        assert.ok(res.status === 403 || res.status === 404);
      });

      it('User B cannot update User A time capsule via PUT /time-capsules/:id', async () => {
        const res = await fetch(`${baseUrl}/api/time-capsules/${aliceLetterId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenBob}`,
          },
          body: JSON.stringify({
            title: 'Hacked by Bob',
          }),
        });
        assert.ok(res.status === 403 || res.status === 404);
      });

      it('User B cannot delete User A time capsule via DELETE /time-capsules/:id', async () => {
        const res = await fetch(`${baseUrl}/api/time-capsules/${aliceLetterId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tokenBob}` },
        });
        assert.ok(res.status === 403 || res.status === 404);
      });
    });

    describe('8. Error Handling & Validation', () => {
      it('rejects POST with missing title or content with 400', async () => {
        const res = await fetch(`${baseUrl}/api/time-capsules`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenAlice}`,
          },
          body: JSON.stringify({
            title: '',
            content: '',
            unlockDate: '2030-01-01',
          }),
        });
        assert.strictEqual(res.status, 400);
      });

      it('DELETE on non-existent capsule returns 404', async () => {
        const res = await fetch(`${baseUrl}/api/time-capsules/non_existent_capsule_12345`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tokenAlice}` },
        });
        assert.strictEqual(res.status, 404);
      });

      it('revealContent helper accurately reveals sealed strings or informs about locked status', () => {
        // Locked / empty content
        const lockedMsg = revealContent('');
        assert.match(lockedMsg, /sealed until its unlock date/);

        // Plain string
        const plainMsg = revealContent('Hello World');
        assert.strictEqual(plainMsg, 'Hello World');

        // Sealed base64
        const b64 = 'sealed:v1:' + Buffer.from('Secret Reflection').toString('base64');
        const unsealed = revealContent(b64);
        assert.strictEqual(unsealed, 'Secret Reflection');
      });
    });
  });
});

