/**
 * FocusFlow — Google Apps Script Write-Back Bridge (Code.gs)
 *
 * Designed for dedicated test spreadsheets (e.g. "FocusFlow Writeback Test").
 * Provides a secure, serverless bridge between FocusFlow backend and Google Sheets.
 *
 * SECURITY MODEL:
 * - Every write is authenticated via HMAC-SHA256 signature generated server-side.
 * - Secret is stored ONLY in Google Apps Script Script Properties (never in sheets or code).
 * - Canonical JSON formatting prevents payload tampering or whitespace evasion.
 * - 5-minute timestamp expiration window prevents replay attacks.
 * - LockService serializes write operations to prevent cell write race conditions.
 *
 * DEPLOYMENT INSTRUCTIONS:
 * 1. In your dedicated Google Spreadsheet ("FocusFlow Writeback Test"):
 *    Click: Extensions > Apps Script.
 * 2. Delete any existing template code and paste this entire file into Code.gs.
 * 3. Configure the Secret Property:
 *    - Click the Gear icon ("Project Settings") on the left sidebar.
 *    - Scroll down to "Script Properties" and click "Edit script properties" > "Add script property".
 *    - Property: FOCUSFLOW_WEBHOOK_SECRET
 *    - Value: <Generate a strong random secret or use your server secret>
 *    - Click "Save script properties".
 * 4. Deploy as Web App:
 *    - Click the blue "Deploy" button (top right) > "New deployment".
 *    - Select type: "Web app" (click gear icon next to "Select type").
 *    - Description: "FocusFlow Write-Back Bridge v1.0"
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone"
 *    - Click "Deploy".
 * 5. Complete Authorization:
 *    - Google will prompt: "Authorization required". Click "Review permissions".
 *    - Select your Google account.
 *    - If Google displays "Google hasn't verified this app", click "Advanced" > "Go to FocusFlow Write-Back Bridge (unsafe)".
 *    - Click "Allow".
 * 6. Copy the Web App URL:
 *    - The URL will look like: https://script.google.com/macros/s/AKfycb.../exec
 *    - Configure this URL on your server:
 *      APPS_SCRIPT_WEBAPP_URL=https://script.google.com/macros/s/.../exec
 *      APPS_SCRIPT_WEBHOOK_SECRET=<your secret matching Step 3>
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Acquire lock for up to 10 seconds to serialize writes cleanly
    lock.waitLock(10000);

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'Empty post data', code: 'EMPTY_BODY' }, 400);
    }

    var rawContent = e.postData.contents;

    // Body size limit: 64KB
    if (rawContent.length > 65536) {
      return jsonResponse({ success: false, error: 'Request body exceeds 64KB limit', code: 'PAYLOAD_TOO_LARGE' }, 413);
    }

    var data;
    try {
      data = JSON.parse(rawContent);
    } catch (parseErr) {
      return jsonResponse({ success: false, error: 'Invalid JSON payload', code: 'INVALID_JSON' }, 400);
    }

    // 1. Secret retrieval from Script Properties
    var secret = PropertiesService.getScriptProperties().getProperty('FOCUSFLOW_WEBHOOK_SECRET');
    if (!secret) {
      return jsonResponse({
        success: false,
        error: 'FOCUSFLOW_WEBHOOK_SECRET is not configured in Script Properties',
        code: 'MISSING_SECRET'
      }, 500);
    }

    // 2. Signature verification
    var incomingSig = (e.parameter && e.parameter.sig) || data.signature;
    if (!incomingSig) {
      return jsonResponse({ success: false, error: 'Missing HMAC signature', code: 'MISSING_SIGNATURE' }, 401);
    }

    // Reconstruct canonical payload (all keys sorted alphabetically, omitting 'signature')
    var canonicalData = {};
    var keys = Object.keys(data).filter(function(k) { return k !== 'signature'; }).sort();
    for (var i = 0; i < keys.length; i++) {
      canonicalData[keys[i]] = data[keys[i]];
    }
    var canonicalString = JSON.stringify(canonicalData);
    var expectedSig = computeHmacHex(canonicalString, secret);

    if (incomingSig.toLowerCase() !== expectedSig.toLowerCase()) {
      return jsonResponse({ success: false, error: 'Invalid HMAC signature', code: 'INVALID_SIGNATURE' }, 401);
    }

    // 3. Replay prevention check (timestamp must be within 5 minutes)
    var now = new Date().getTime();
    if (typeof data.timestamp !== 'number' || Math.abs(now - data.timestamp) > 300000) {
      return jsonResponse({ success: false, error: 'Request timestamp expired or missing', code: 'TIMESTAMP_EXPIRED' }, 400);
    }

    // Nonce replay protection via Script Cache (expires in 6 minutes, exceeding timestamp window)
    var nonce = data.nonce;
    if (nonce && typeof nonce === 'string') {
      var cache = CacheService.getScriptCache();
      var cachedNonce = cache.get('ff_nonce_' + nonce);
      if (cachedNonce) {
        return jsonResponse({ success: false, error: 'Replay detected: nonce already consumed', code: 'NONCE_REPLAY' }, 403);
      }
      cache.put('ff_nonce_' + nonce, '1', 360);
    }

    // 4. Action validation
    if (data.action !== 'write_cell') {
      return jsonResponse({ success: false, error: 'Unsupported action: ' + data.action, code: 'UNSUPPORTED_ACTION' }, 400);
    }

    var sheetTitle = data.sheetTitle;
    var rowNumberHint = parseInt(data.rowNumber, 10);
    var colLetter = typeof data.colLetter === 'string' ? data.colLetter.trim().toUpperCase() : '';
    var value = data.value;
    var expectedIdentity = data.expectedIdentity;

    if (!sheetTitle || !rowNumberHint || rowNumberHint < 1 || !colLetter) {
      return jsonResponse({ success: false, error: 'Invalid or missing cell coordinates', code: 'INVALID_COORDINATES' }, 400);
    }

    // 5. Open target spreadsheet
    var ss;
    if (data.spreadsheetId && data.spreadsheetId !== 'active') {
      try {
        ss = SpreadsheetApp.openById(data.spreadsheetId);
      } catch (openErr) {
        return jsonResponse({
          success: false,
          error: 'Spreadsheet could not be accessed with id: ' + data.spreadsheetId,
          code: 'SPREADSHEET_NOT_FOUND',
          statusCode: 404
        }, 404);
      }
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    if (!ss) {
      return jsonResponse({ success: false, error: 'Spreadsheet could not be accessed', code: 'SPREADSHEET_NOT_FOUND' }, 404);
    }

    var sheet = ss.getSheetByName(sheetTitle);
    if (!sheet) {
      return jsonResponse({ success: false, error: 'Worksheet tab not found: ' + sheetTitle, code: 'TAB_NOT_FOUND' }, 404);
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var targetRow = rowNumberHint;
    var correctedRow = null;

    // 6. Row Identity Verification (Prevent stale row writes after sorting or row insertion)
    if (expectedIdentity && (expectedIdentity.subtopic || expectedIdentity.topic)) {
      var normSub = normalizeComparisonStr(expectedIdentity.subtopic);
      var normTop = normalizeComparisonStr(expectedIdentity.topic);
      var normMod = normalizeComparisonStr(expectedIdentity.module);

      var isRowMatching = function(rowIdx) {
        if (rowIdx < 1 || rowIdx > lastRow) return false;
        var rowVals = sheet.getRange(rowIdx, 1, 1, Math.min(lastCol, 10)).getValues()[0];
        var textCombined = rowVals.map(function(v) { return normalizeComparisonStr(v); }).join(' ');
        if (normSub && textCombined.indexOf(normSub) === -1) return false;
        if (normTop && textCombined.indexOf(normTop) === -1) return false;
        if (normMod && textCombined.indexOf(normMod) === -1) return false;
        return true;
      };

      // Check hinted row first
      if (isRowMatching(rowNumberHint)) {
        targetRow = rowNumberHint;
      } else {
        // Hinted row drifted: scan all rows to locate exact topic
        var matchedRows = [];
        for (var r = 2; r <= lastRow; r++) {
          if (isRowMatching(r)) {
            matchedRows.push(r);
          }
        }

        if (matchedRows.length === 0) {
          return jsonResponse({
            success: false,
            error: 'Row identity verification failed: topic not found in sheet (checked after row drift)',
            code: 'ROW_NOT_FOUND'
          }, 404);
        }

        if (matchedRows.length > 1) {
          return jsonResponse({
            success: false,
            error: 'Ambiguous row match: duplicate topics found with identical composite keys (' + matchedRows.length + ' matches)',
            code: 'DUPLICATE_ROW_IDENTITY'
          }, 409);
        }

        targetRow = matchedRows[0];
        correctedRow = targetRow;
      }
    }

    var cellA1 = colLetter + targetRow;
    var range = sheet.getRange(cellA1);

    // Normalize boolean vs scalar
    if (typeof value === 'boolean') {
      range.setValue(value);
    } else if (value === 'TRUE' || value === 'true') {
      range.setValue(true);
    } else if (value === 'FALSE' || value === 'false') {
      range.setValue(false);
    } else {
      range.setValue(value);
    }

    SpreadsheetApp.flush();

    var respPayload = {
      success: true,
      updatedCell: sheetTitle + '!' + cellA1,
      value: range.getValue(),
      rowNumber: targetRow,
      colLetter: colLetter,
      sheetTitle: sheetTitle,
      updatedAt: new Date().toISOString()
    };

    if (correctedRow !== null) {
      respPayload.correctedRowNumber = correctedRow;
    }

    return jsonResponse(respPayload, 200);

  } catch (err) {
    return jsonResponse({ success: false, error: err.toString(), code: 'EXECUTION_ERROR' }, 500);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Normalizes strings for robust row identity comparison.
 */
function normalizeComparisonStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Computes HMAC-SHA256 hex digest using Google Apps Script Utilities.
 */
function computeHmacHex(message, secret) {
  var signatureBytes = Utilities.computeHmacSha256Signature(message, secret);
  return signatureBytes.map(function(byte) {
    var b = byte < 0 ? byte + 256 : byte;
    var hex = b.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Formats JSON response with appropriate MIME type.
 */
function jsonResponse(obj, statusCode) {
  if (typeof obj === 'object' && obj !== null) {
    obj.statusCode = statusCode || (obj.success ? 200 : 500);
  }
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Health check endpoint for testing deployment connectivity.
 */
function doGet(e) {
  return jsonResponse({
    status: 'healthy',
    service: 'FocusFlow Apps Script Write-Back Bridge',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  }, 200);
}

