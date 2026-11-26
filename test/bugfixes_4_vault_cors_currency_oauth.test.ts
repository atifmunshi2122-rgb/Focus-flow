import './test_bootstrap.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isValidRatio, computeVaultSettlement } from '../src/lib/vaultIntelligence.ts';
import { formatCurrency } from '../src/lib/currency.ts';
import { corsHandler } from '../server/security.ts';
import { resolveNavTabFromLocation } from '../src/context/AppContext.tsx';
import type { VaultExpense, VaultMember } from '../src/types/vault.ts';

test('Bug 1 — Joint Vault isValidRatio supports solo 1-member vaults & computeVaultSettlement filters active members', () => {
  // Solo vault ratio validation
  assert.equal(isValidRatio({ uid_alice: 100 }, ['uid_alice']), true);
  assert.equal(isValidRatio({ uid_alice: 80 }, ['uid_alice']), false);
  assert.equal(isValidRatio({ uid_alice: 100, uid_stranger: 0 }, ['uid_alice']), false);
  assert.equal(isValidRatio({ uid_alice: 50, uid_bob: 50 }, ['uid_alice', 'uid_bob']), true);
  assert.equal(isValidRatio({ uid_alice: 50 }, ['uid_alice', 'uid_bob']), false);

  // Left member must be excluded from settlement calculation
  const membersWithLeftPartner: VaultMember[] = [
    {
      uid: 'uid_alice',
      email: 'alice@example.com',
      name: 'Alice',
      role: 'creator',
      status: 'active',
      joinedAt: '2026-11-01T00:00:00Z',
    },
    {
      uid: 'uid_bob_left',
      email: 'bob@example.com',
      name: 'Bob',
      role: 'partner',
      status: 'left',
      joinedAt: '2026-11-02T00:00:00Z',
      leftAt: '2026-11-05T00:00:00Z',
    },
    {
      uid: 'uid_carol',
      email: 'carol@example.com',
      name: 'Carol',
      role: 'partner',
      status: 'active',
      joinedAt: '2026-11-06T00:00:00Z',
    },
  ];

  const expenses: VaultExpense[] = [
    {
      id: 'exp_1',
      vaultId: 'v1',
      paidByUid: 'uid_alice',
      payerName: 'Alice',
      amountPaise: 100000,
      description: 'Groceries',
      date: '2026-11-07',
      splitMode: 'equal',
      memberShares: { uid_alice: 50000, uid_carol: 50000 },
      createdAt: '2026-11-07T10:00:00Z',
      status: 'active',
    },
  ];

  const settlement = computeVaultSettlement(membersWithLeftPartner, expenses, []);
  assert.ok(settlement);
  assert.equal(settlement.memberA.uid, 'uid_alice');
  assert.equal(settlement.memberB.uid, 'uid_carol');
  assert.equal(settlement.debtorUid, 'uid_carol');
  assert.equal(settlement.creditorUid, 'uid_alice');
  assert.equal(settlement.netBalancePaise, 50000);

  // Only 1 active member + 1 left member => no 2-member settlement possible
  assert.equal(
    computeVaultSettlement(membersWithLeftPartner.slice(0, 2), expenses, []),
    null
  );
});

test('Bug 2 — CORS wildcard (*) never pairs with Allow-Credentials & malformed APP_URL does not crash', () => {
  const prevAllowed = process.env.ALLOWED_ORIGINS;
  const prevAppUrl = process.env.APP_URL;

  try {
    // 1. Wildcard CORS must emit '*' and MUST NOT emit Access-Control-Allow-Credentials: true
    process.env.ALLOWED_ORIGINS = '*';
    delete process.env.APP_URL;
    const wildcardHeaders: Record<string, string> = {};
    let next1 = false;
    corsHandler(
      {
        method: 'GET',
        headers: { host: 'api.example.com', origin: 'https://attacker.example' },
      } as unknown as import('express').Request,
      {
        setHeader(k: string, v: string) {
          wildcardHeaders[k.toLowerCase()] = v;
        },
      } as unknown as import('express').Response,
      () => {
        next1 = true;
      }
    );
    assert.equal(next1, true);
    assert.equal(wildcardHeaders['access-control-allow-origin'], '*');
    assert.equal(wildcardHeaders['access-control-allow-credentials'], undefined);

    // 2. Protocol-less or invalid APP_URL must never throw
    delete process.env.ALLOWED_ORIGINS;
    process.env.APP_URL = 'focusflow.vercel.app';
    const hostHeaders: Record<string, string> = {};
    corsHandler(
      {
        method: 'GET',
        headers: { host: 'api.example.com', origin: 'https://focusflow.vercel.app' },
      } as unknown as import('express').Request,
      {
        setHeader(k: string, v: string) {
          hostHeaders[k.toLowerCase()] = v;
        },
      } as unknown as import('express').Response,
      () => {}
    );
    assert.equal(hostHeaders['access-control-allow-origin'], 'https://focusflow.vercel.app');
    assert.equal(hostHeaders['access-control-allow-credentials'], 'true');

    process.env.APP_URL = 'http://[invalid-url';
    const badHeaders: Record<string, string> = {};
    assert.doesNotThrow(() => {
      corsHandler(
        {
          method: 'GET',
          headers: { host: 'api.example.com', origin: 'https://other.example' },
        } as unknown as import('express').Request,
        {
          setHeader(k: string, v: string) {
            badHeaders[k.toLowerCase()] = v;
          },
        } as unknown as import('express').Response,
        () => {}
      );
    });
    assert.equal(badHeaders['access-control-allow-origin'], undefined);
  } finally {
    if (prevAllowed === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = prevAllowed;
    if (prevAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevAppUrl;
  }
});

test('Bug 3 — formatCurrency compact mode uses L/Cr for INR and K/M/B for USD/EUR/GBP', () => {
  // INR keeps Indian units
  assert.equal(formatCurrency(15000000, 'INR', { compact: true }), '₹1.5L');
  assert.equal(formatCurrency(1000000000, 'INR', { compact: true }), '₹1.00Cr');

  // USD, EUR, GBP use international K / M / B units
  assert.equal(formatCurrency(15000000, 'USD', { compact: true }), '$150.0K');
  assert.equal(formatCurrency(150000000, 'USD', { compact: true }), '$1.50M');
  assert.equal(formatCurrency(1000000000, 'USD', { compact: true }), '$10.00M');
  assert.equal(formatCurrency(250000000000, 'USD', { compact: true }), '$2.50B');
  assert.equal(formatCurrency(15000000, 'EUR', { compact: true }), '€150.0K');
  assert.equal(formatCurrency(200000000, 'GBP', { compact: true }), '£2.00M');
});

test('Bug 4 — Google Calendar OAuth fallback redirect resolves directly to settings tab', () => {
  const oauthSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'server/routes/googleCalendarOAuthCallback.ts'),
    'utf8'
  );
  assert.match(oauthSrc, /\?tab=settings&calendar=connected#settings/);
  assert.equal(resolveNavTabFromLocation('?tab=settings&calendar=connected', '#settings'), 'settings');
  assert.equal(resolveNavTabFromLocation('?tab=settings&calendar=connected', ''), 'settings');
});

