import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDriveProgressTrackerTab, escapeSheetFormulaCell } from '../server/driveWorker';

describe('WhiteboardCanvas & api.saveWhiteboardDrawing + driveWorker fixes', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('1a. api.saveWhiteboardDrawing populates sizeBytes and caps title/topicTitle to 128 chars', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body) {
        capturedBody = JSON.parse(String(init.body));
      }
      return new Response(JSON.stringify({ id: 'wb_1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const { api } = await import('../src/lib/api');
    const longTitle = 'T'.repeat(200);
    const longTopic = 'S'.repeat(180);
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    await api.saveWhiteboardDrawing({
      title: longTitle,
      topicTitle: longTopic,
      dataUrl,
      width: 800,
      height: 540,
    });

    const body = capturedBody as Record<string, unknown> | null;
    if (!body) {
      assert.fail('Expected fetch request body to be captured');
    }
    assert.equal(body.sizeBytes, new TextEncoder().encode(dataUrl).length);
    assert.equal(String(body.title).length, 128);
    assert.equal(String(body.topicTitle).length, 128);
  });

  it('1b & 2. WhiteboardCanvas source includes sizeBytes, 128-char caps, isDrawingRef guard on pointerUp, and Undo/Redo localStorage sync', () => {
    const srcPath = path.resolve(process.cwd(), 'src/components/study/WhiteboardCanvas.tsx');
    const src = fs.readFileSync(srcPath, 'utf8');

    // Bug 1: sizeBytes & 128-char truncation in handleAttachAndSave
    assert.ok(src.includes('sizeBytes'));
    assert.ok(src.includes('.slice(0, 128)'));

    // Bug 2a: handlePointerUp guards on isDrawingRef.current before encoding PNG / writing localStorage
    const pointerUpIdx = src.indexOf('const handlePointerUp =');
    assert.ok(pointerUpIdx > -1);
    const pointerUpSnippet = src.slice(pointerUpIdx, pointerUpIdx + 140);
    assert.ok(pointerUpSnippet.includes('if (!isDrawingRef.current) return;'));

    // Bug 2b: handleUndo and handleRedo both call syncBufferAndLocalDraft(canvas)
    const undoIdx = src.indexOf('const handleUndo =');
    const redoIdx = src.indexOf('const handleRedo =');
    assert.ok(undoIdx > -1);
    assert.ok(redoIdx > -1);
    assert.ok(src.slice(undoIdx, redoIdx).includes('syncBufferAndLocalDraft(canvas)'));
    assert.ok(src.slice(redoIdx, redoIdx + 700).includes('syncBufferAndLocalDraft(canvas)'));
  });

  it('3a. escapeSheetFormulaCell neutralizes leading formula trigger characters', () => {
    assert.equal(escapeSheetFormulaCell('=IMPORTXML("http://evil")'), '\'=IMPORTXML("http://evil")');
    assert.equal(escapeSheetFormulaCell('+1+1'), "'+1+1");
    assert.equal(escapeSheetFormulaCell('-cmd|"/c calc"!A0'), '\'-cmd|"/c calc"!A0');
    assert.equal(escapeSheetFormulaCell('@SUM(A1:A2)'), "'@SUM(A1:A2)");
    assert.equal(escapeSheetFormulaCell('Normal Unit 1'), 'Normal Unit 1');
  });

  it('3b. ensureDriveProgressTrackerTab returns false when values.update PUT fails and escapes formula payloads', async () => {
    let sentValues: unknown[][] | undefined;

    const failPutFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes(':batchUpdate')) {
        return new Response(JSON.stringify({ replies: [] }), { status: 200 });
      }
      if (url.includes('/values/') && init?.method === 'PUT') {
        sentValues = JSON.parse(String(init.body)).values;
        return new Response(JSON.stringify({ error: 'Quota exceeded' }), { status: 429 });
      }
      return new Response(JSON.stringify({ sheets: [] }), { status: 200 });
    }) as typeof fetch;

    const result = await ensureDriveProgressTrackerTab(
      'sheet-123',
      'token-abc',
      [{ unit: '=1+1', topic: '+Hyperlink', subtopic: '@cmd', isCompleted: true }],
      failPutFetch
    );

    assert.equal(result, false);
    assert.equal(sentValues?.[1]?.[0], "'=1+1");
    assert.equal(sentValues?.[1]?.[1], "'+Hyperlink");
    assert.equal(sentValues?.[1]?.[2], "'@cmd");
  });
});
