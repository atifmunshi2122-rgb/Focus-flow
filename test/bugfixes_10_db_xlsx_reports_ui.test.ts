import './test_bootstrap.ts';
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import express from 'express';

import { apiRouter } from '../server/routes.ts';
import { dbService } from '../server/db.ts';
import { parseXlsxBuffer } from '../server/localXlsxParser.ts';
import { defaultIdempotencyLedger } from '../server/durableIdempotencyLedger.ts';
import {
  escapeCsvCell,
  exportSpecificFinancialReportCsv,
  buildPrintableSpecificFinancialReportHtml,
} from '../src/lib/exportReports.ts';
import { getTodayDateString, addDays } from '../src/lib/dateTime.ts';

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

function buildMinimalZipBuffer(
  entries: Array<{ name: string; content: Buffer; compressedOverride?: Buffer; declaredSizeOverride?: number }>
): Buffer {
  const localParts: Buffer[] = [];
  const cdParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const compressed = entry.compressedOverride ?? zlib.deflateRawSync(entry.content);
    const uncompressedSize = entry.declaredSizeOverride ?? entry.content.length;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(8, 8);
    lfh.writeUInt32LE(compressed.length, 18);
    lfh.writeUInt32LE(uncompressedSize, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    localParts.push(lfh, nameBuf, compressed);

    const cdfh = Buffer.alloc(46);
    cdfh.writeUInt32LE(0x02014b50, 0);
    cdfh.writeUInt16LE(20, 4);
    cdfh.writeUInt16LE(20, 6);
    cdfh.writeUInt16LE(8, 10);
    cdfh.writeUInt32LE(compressed.length, 20);
    cdfh.writeUInt32LE(uncompressedSize, 24);
    cdfh.writeUInt16LE(nameBuf.length, 28);
    cdfh.writeUInt32LE(offset, 42);

    cdParts.push(cdfh, nameBuf);
    offset += lfh.length + nameBuf.length + compressed.length;
  }

  const cdBuf = Buffer.concat(cdParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, cdBuf, eocd]);
}

describe('Comprehensive 10-Bug Regression Suite (DB, XLSX Parser, Reports, UI)', () => {
  let server: http.Server;
  let baseUrl = '';

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', apiRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => {
    delete (globalThis as any).document;
  });

  it('1. saveStudyTier rejects cross-tenant IDOR overwrite with Forbidden and 403', async () => {
    const userA = `usr_tier_a_${Date.now()}`;
    const userB = `usr_tier_b_${Date.now()}`;
    dbService.ensureUserWorkspace(userA);
    dbService.ensureUserWorkspace(userB);

    const tierA = dbService.saveStudyTier(userA, {
      id: `tier_custom_${Date.now()}`,
      name: 'Alice Original Tier',
      shortTitle: 'Alice',
    });

    assert.throws(
      () =>
        dbService.saveStudyTier(userB, {
          id: tierA.id,
          name: 'Hijacked by Bob',
        }),
      /Forbidden/i
    );

    const res = await fetch(`${baseUrl}/api/study/tiers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createAuthJwt(userB)}`,
      },
      body: JSON.stringify({ id: tierA.id, name: 'Hijacked via HTTP' }),
    });
    assert.equal(res.status, 403);
    assert.equal(dbService.getStudyTiers(userA).find((t) => t.id === tierA.id)?.name, 'Alice Original Tier');
  });

  it('2. localXlsxParser prevents XML entity double-unescaping, decodes numeric entities, and blocks Zip Bombs / OOB', () => {
    const workbookXml = `<?xml version="1.0" encoding="UTF-8"?><workbook><sheets><sheet name="Main&amp;lt;Tab&#x20B9;" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const relsXml = `<?xml version="1.0" encoding="UTF-8"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`;
    const ssXml = `<?xml version="1.0" encoding="UTF-8"?><sst><si><t>&amp;lt;script&amp;gt;&#10;&#x20B9;500</t></si></sst>`;
    const sheetXml = `<?xml version="1.0" encoding="UTF-8"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`;

    const validZip = buildMinimalZipBuffer([
      { name: 'xl/workbook.xml', content: Buffer.from(workbookXml, 'utf8') },
      { name: 'xl/_rels/workbook.xml.rels', content: Buffer.from(relsXml, 'utf8') },
      { name: 'xl/sharedStrings.xml', content: Buffer.from(ssXml, 'utf8') },
      { name: 'xl/worksheets/sheet1.xml', content: Buffer.from(sheetXml, 'utf8') },
    ]);

    const parsed = parseXlsxBuffer(validZip);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].sheetTitle, 'Main&lt;Tab₹');
    assert.equal((parsed[0].rows[0][0] as any).value, '&lt;script&gt;\n₹500');

    // Zip Bomb payload: 12 MB buffer compressed cleanly (> 10 MB per-entry maxOutputLength limit)
    const bombContent = Buffer.alloc(12 * 1024 * 1024, 0x41);
    const bombZip = buildMinimalZipBuffer([
      { name: 'xl/workbook.xml', content: bombContent, declaredSizeOverride: 100 },
    ]);
    assert.throws(() => parseXlsxBuffer(bombZip), /Zip Bomb protection|safe uncompressed size limit/i);

    // Out-of-bounds central directory offset
    const oobBuf = Buffer.from(validZip);
    oobBuf.writeUInt32LE(oobBuf.length + 9999, oobBuf.length - 6);
    assert.throws(() => parseXlsxBuffer(oobBuf), /out of bounds/i);
  });

  it('3. dbService.reseed("usr_atif_default") preserves other users study, vault, v18, gamification, and social data', () => {
    const otherUid = `usr_preserve_${Date.now()}`;
    dbService.ensureUserWorkspace(otherUid);
    const subj = dbService.saveStudySubject(otherUid, { name: 'Preserve Subject', code: `PRV_${Date.now()}` });
    const vault = dbService.createJointVault({ name: 'Preserve Vault', targetPaise: 500000 }, { id: otherUid, name: 'Other' });
    const raw = dbService.getRaw() as any;
    raw.skillNodes = [...(raw.skillNodes || []), { id: `sk_${Date.now()}`, userId: otherUid, title: 'Keep Skill' }];
    raw.timeCapsules = [...(raw.timeCapsules || []), { id: `cap_${Date.now()}`, userId: otherUid, title: 'Keep Cap', content: 'hi', unlockDate: '2099-01-01', isUnlocked: false, isSealed: true, createdAt: new Date().toISOString() }];
    raw.gamificationProfiles = [...(raw.gamificationProfiles || []), { userId: otherUid, totalXP: 900 }];
    raw.socialSquads = [...(raw.socialSquads || []), { id: `sq_${Date.now()}`, name: 'Keep Squad', ownerId: otherUid }];

    dbService.reseed('usr_atif_default');

    assert.ok(dbService.getStudySubjects(otherUid).some((s) => s.id === subj.id));
    assert.ok(dbService.getVault(vault.id, otherUid));
    assert.ok(dbService.getRaw().skillNodes?.some((n: any) => n.userId === otherUid));
    assert.ok(dbService.getRaw().timeCapsules?.some((c: any) => c.userId === otherUid));
    assert.ok(dbService.getRaw().gamificationProfiles.some((g: any) => g.userId === otherUid));
    assert.ok(dbService.getRaw().socialSquads?.some((s: any) => s.ownerId === otherUid));
  });

  it('4. Local VaultMember scopes by vaultId without cross-vault leave corruption, and createJointVault blocks ID collision', () => {
    const owner = `usr_v_owner_${Date.now()}`;
    const partner = `usr_v_partner_${Date.now()}`;
    const attacker = `usr_v_att_${Date.now()}`;

    const v1 = dbService.createJointVault({ id: `v_iso_1_${Date.now()}`, name: 'Vault 1', targetPaise: 100000 }, { id: owner, name: 'Alice' });
    const v2 = dbService.createJointVault({ id: `v_iso_2_${Date.now()}`, name: 'Vault 2', targetPaise: 200000 }, { id: owner, name: 'Alice' });

    const inv1 = dbService.createVaultInvitation(v1.id, { id: owner, name: 'Alice' });
    const inv2 = dbService.createVaultInvitation(v2.id, { id: owner, name: 'Alice' });
    dbService.acceptVaultInvitation(inv1.inviteCode, { id: partner, name: 'Bob' });
    dbService.acceptVaultInvitation(inv2.inviteCode, { id: partner, name: 'Bob' });

    assert.equal(dbService.getVaultSummary(v1.id, owner)?.members.length, 2);
    assert.equal(dbService.getVaultSummary(v2.id, owner)?.members.length, 2);

    // Leave vault 1 -> vault 2 membership for partner MUST stay active
    assert.equal(dbService.leaveVault(v1.id, partner), true);
    const v2Summary = dbService.getVaultSummary(v2.id, owner);
    assert.equal(v2Summary?.members.filter((m) => m.uid === partner && m.status === 'active').length, 1);

    // ID collision leak check
    assert.throws(
      () => dbService.createJointVault({ id: v1.id, name: 'Hijack', targetPaise: 100 }, { id: attacker }),
      /Forbidden/i
    );
  });

  it('5. exportReports escapes non-numeric formula triggers, looks up categoryBudgets by categoryId, and renders type/currency-aware printable reports', () => {
    assert.equal(escapeCsvCell('=IMPORTXML("http://evil")'), `"'=IMPORTXML(""http://evil"")"`);
    assert.equal(escapeCsvCell('=1+1'), "'=1+1");
    assert.equal(escapeCsvCell('+1+2'), "'+1+2");
    assert.equal(escapeCsvCell('-SUM(A1:A2)'), "'-SUM(A1:A2)");
    assert.equal(escapeCsvCell('@cmd'), "'@cmd");
    assert.equal(escapeCsvCell('\t=1'), "'\t=1");
    assert.equal(escapeCsvCell('\r=1'), "\"'\r=1\"");
    assert.equal(escapeCsvCell('-150.00'), '-150.00');
    assert.equal(escapeCsvCell(-42), '-42');

    const todayStr = getTodayDateString();
    const yesterdayStr = addDays(todayStr, -1);

    let capturedCsv = '';
    const origCreateUrl = URL.createObjectURL;
    const origRevokeUrl = URL.revokeObjectURL;
    const origBlob = globalThis.Blob;
    (globalThis as any).Blob = class MockBlob {
      constructor(parts: any[]) {
        capturedCsv = parts.join('');
      }
    };
    URL.createObjectURL = () => 'blob:mock';
    URL.revokeObjectURL = () => {};
    (globalThis as any).document = {
      body: { appendChild: () => {}, removeChild: () => {} },
      createElement: () => ({ click: () => {} }),
    };

    try {
      exportSpecificFinancialReportCsv({
        reportType: 'category',
        incomes: [],
        expenses: [
          {
            id: 'e1',
            userId: 'u1',
            categoryId: 'cat_food_1',
            categoryName: 'Food & Dining',
            amountPaise: 25000,
            date: todayStr,
            description: 'Lunch',
            type: 'variable',
            paymentMethod: 'upi_bank',
            createdAt: new Date().toISOString(),
          } as any,
        ],
        bills: [],
        savingsGoals: [],
        categoryBudgets: { cat_food_1: 100000 },
        currency: 'USD',
      });
    } finally {
      (globalThis as any).Blob = origBlob;
      URL.createObjectURL = origCreateUrl;
      URL.revokeObjectURL = origRevokeUrl;
    }

    assert.ok(capturedCsv.includes('Budget Limit (USD)'));
    assert.ok(capturedCsv.includes('Food & Dining,250.00,1000.00,1,25%'));

    // Printable HTML respects currency + reportType
    const incomeHtml = buildPrintableSpecificFinancialReportHtml({
      reportType: 'income',
      incomes: [
        { id: 'i1', userId: 'u1', source: 'Freelance USD Client', category: 'Consulting', amountPaise: 50000, date: todayStr, createdAt: '' } as any,
      ],
      expenses: [
        { id: 'e2', userId: 'u1', categoryId: 'cat_1', categoryName: 'Rent', description: 'ShouldNotAppear', amountPaise: 99900, date: todayStr, type: 'fixed', paymentMethod: 'upi_bank', createdAt: '' } as any,
      ],
      bills: [],
      savingsGoals: [],
      currency: 'USD',
      userName: 'Alice',
    });
    assert.ok(incomeHtml.includes('$500.00'));
    assert.ok(incomeHtml.includes('Freelance USD Client'));
    assert.equal(incomeHtml.includes('ShouldNotAppear'), false);
    assert.equal(incomeHtml.includes('Amount (INR)'), false);

    const dailyHtml = buildPrintableSpecificFinancialReportHtml({
      reportType: 'daily',
      incomes: [],
      expenses: [
        { id: 'ed1', userId: 'u1', categoryId: 'c1', description: 'Today Coffee', amountPaise: 1500, date: todayStr, type: 'variable', paymentMethod: 'cash', createdAt: '' } as any,
        { id: 'ed2', userId: 'u1', categoryId: 'c1', description: 'Yesterday Excluded', amountPaise: 4500, date: yesterdayStr, type: 'variable', paymentMethod: 'cash', createdAt: '' } as any,
      ],
      bills: [],
      savingsGoals: [],
      currency: 'EUR',
    });
    assert.ok(dailyHtml.includes('Today Coffee'));
    assert.equal(dailyHtml.includes('Yesterday Excluded'), false);
    assert.ok(dailyHtml.includes('€15.00'));
  });

  it('6. Trashed bills cannot be paid or undone', () => {
    const uid = `usr_bill_trash_${Date.now()}`;
    dbService.ensureUserWorkspace(uid);
    const nowIso = new Date().toISOString();
    const billId = `bill_trash_${Date.now()}`;
    dbService.getRaw().bills.push({
      id: billId,
      userId: uid,
      categoryId: dbService.getFallbackCategoryId(uid),
      name: 'Trashable Bill',
      amountPaise: 50000,
      dueDate: '2026-12-01',
      status: 'UNPAID',
      recurrence: 'monthly',
      paymentDate: null,
      deletedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);
    const histCountBefore = dbService.getRaw().paymentHistory.length;

    const payRes = dbService.markBillAsPaid(uid, billId);
    assert.equal(payRes.success, false);
    assert.equal(payRes.error, 'Bill not found');

    const paidBillId = `bill_paid_trash_${Date.now()}`;
    dbService.getRaw().bills.push({
      id: paidBillId,
      userId: uid,
      categoryId: dbService.getFallbackCategoryId(uid),
      name: 'Trashed Paid Bill',
      amountPaise: 40000,
      dueDate: '2026-12-01',
      status: 'PAID',
      recurrence: 'monthly',
      paymentDate: '2026-11-20',
      deletedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    } as any);

    const undoRes = dbService.undoBillPayment(uid, paidBillId);
    assert.equal(undoRes.success, false);
    assert.equal(undoRes.error, 'Bill not found');
    assert.equal(dbService.getRaw().paymentHistory.length, histCountBefore);
  });

  it('7. defaultIdempotencyLedger.repository caches singleton instance across calls', () => {
    const firstRef = defaultIdempotencyLedger.repository;
    const secondRef = defaultIdempotencyLedger.repository;
    assert.equal(firstRef, secondRef);
  });

  it('8, 9 & 10. UI/Backend fixes for Task reorder, BillsTracker cache/status, Subscription reminderDays: 0, and Envelope available funds', () => {
    const taskSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/tasks/TaskManager.tsx'), 'utf8');
    assert.ok(taskSrc.includes('shifted.map((t) => api.updateTask(t.id, { order: t.order }))'));

    const billsSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/finance/BillsTracker.tsx'), 'utf8');
    assert.ok(billsSrc.includes("if (statusFilter === 'ALL') {\n          clientDataCache.setBills(billsData);"));
    assert.ok(billsSrc.includes("created.status || (created.dueDate < getTodayDateString() ? 'OVERDUE' : 'UNPAID')"));

    const subSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/finance/SubscriptionManager.tsx'), 'utf8');
    assert.equal(subSrc.includes('Number(formReminderDays) || 3'), false);

    const envSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/finance/EnvelopeBudgetManager.tsx'), 'utf8');
    assert.ok(envSrc.includes('source.allocatedPaise - Math.max(0, source.spentPaise || 0)'));

    // Backend reminderDays: 0 check
    const uid = `usr_sub_env_${Date.now()}`;
    dbService.ensureUserWorkspace(uid);
    const subZero = dbService.saveSubscription(uid, {
      name: 'Zero Reminder',
      amountPaise: 19900,
      reminderDays: 0,
    });
    assert.equal(subZero.reminderDays, 0);

    // Backend envelope available balance check
    const monthKey = getTodayDateString().slice(0, 7);
    const catId = `cat_env_chk_${Date.now()}`;
    dbService.getRaw().categories.push({
      id: catId,
      userId: uid,
      name: 'Dining',
      type: 'variable',
      icon: 'Tag',
      color: '#10b981',
    } as any);
    const fromEnv = dbService.saveEnvelope(uid, {
      name: 'Dining Env',
      categoryId: catId,
      allocatedPaise: 100000,
      monthKey,
    });
    const toEnv = dbService.saveEnvelope(uid, {
      name: 'Travel Env',
      allocatedPaise: 20000,
      monthKey,
    });
    dbService.getRaw().expenseTransactions.push({
      id: `exp_env_${Date.now()}`,
      userId: uid,
      categoryId: catId,
      amountPaise: 70000,
      date: `${monthKey}-05`,
      description: 'Dinner',
      type: 'variable',
      paymentMethod: 'upi_bank',
      createdAt: new Date().toISOString(),
    } as any);

    // 100000 allocated - 70000 spent = 30000 available -> transferring 50000 must fail!
    const failTransfer = dbService.transferEnvelopeFunds(uid, fromEnv.id, toEnv.id, 50000);
    assert.equal(failTransfer.success, false);
    assert.match(failTransfer.error || '', /insufficient/i);

    // Transferring 25000 (<= 30000 available) must succeed
    const okTransfer = dbService.transferEnvelopeFunds(uid, fromEnv.id, toEnv.id, 25000);
    assert.equal(okTransfer.success, true);
  });
});
