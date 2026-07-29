var QR_CHECKIN_CONFIG = Object.freeze({
  spreadsheetId: "1SFZvveMY5WqPCQ1uZoyGvOh1CFJpT-nGnqO0tvUbP6s",
  studentSheetName: "all",
  logSheetName: "qrcode-scan",
  codeHeader: "Code",
  preferredNameHeaders: ["Chi+Eng", "Name Chi", "Name Eng Proper"],
  logHeaders: ["Timestamp", "Code", "Name", "Source Row"],
  lockTimeoutMs: 15000
});

/**
 * Receives a QR/manual code, validates it against the student list, and logs
 * one check-in. The source "Code" column is never written to.
 *
 * Expected request:
 *   Content-Type: application/x-www-form-urlencoded
 *   body: code=YDN0103
 *
 * @param {Object} e Apps Script web-app event.
 * @return {GoogleAppsScript.Content.TextOutput} JSON response.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  var hasLock = false;

  try {
    var requestedCode = readRequestCode_(e);

    if (!requestedCode) {
      return jsonResponse_({
        status: "invalid",
        message: "Invalid code"
      });
    }

    hasLock = lock.tryLock(QR_CHECKIN_CONFIG.lockTimeoutMs);

    if (!hasLock) {
      return jsonResponse_({
        status: "error",
        message: "Check-in is busy. Please try again."
      });
    }

    var spreadsheet = SpreadsheetApp.openById(
      QR_CHECKIN_CONFIG.spreadsheetId
    );
    var studentSheet = spreadsheet.getSheetByName(
      QR_CHECKIN_CONFIG.studentSheetName
    );
    var logSheet = spreadsheet.getSheetByName(
      QR_CHECKIN_CONFIG.logSheetName
    );

    if (!studentSheet || !logSheet) {
      throw new Error("Required sheet is missing.");
    }

    assertLogSchema_(logSheet);

    var headers = studentSheet
      .getRange(1, 1, 1, studentSheet.getLastColumn())
      .getDisplayValues()[0];
    var codeColumn = findHeaderColumn_(headers, [
      QR_CHECKIN_CONFIG.codeHeader
    ]);
    var nameColumn = findHeaderColumn_(
      headers,
      QR_CHECKIN_CONFIG.preferredNameHeaders
    );

    if (codeColumn === -1 || nameColumn === -1) {
      throw new Error("Required Code or name column is missing.");
    }

    var studentMatch = findExactCode_(
      studentSheet,
      codeColumn + 1,
      requestedCode
    );

    if (!studentMatch) {
      return jsonResponse_({
        status: "invalid",
        message: "Invalid code"
      });
    }

    var sourceRow = studentMatch.getRow();
    var canonicalCode = normalizeCode_(studentMatch.getDisplayValue());
    var studentName = studentSheet
      .getRange(sourceRow, nameColumn + 1)
      .getDisplayValue()
      .trim();

    if (isDuplicateCode_(logSheet, canonicalCode)) {
      return jsonResponse_({
        status: "duplicate",
        message: "Already checked in",
        code: canonicalCode,
        name: studentName
      });
    }

    logSheet
      .getRange(logSheet.getLastRow() + 1, 1, 1, 4)
      .setValues([[new Date(), canonicalCode, studentName, sourceRow]]);
    SpreadsheetApp.flush();

    return jsonResponse_({
      status: "success",
      message: "Successfully checked in",
      code: canonicalCode,
      name: studentName
    });
  } catch (error) {
    console.error("QR check-in failed: " + error.stack);

    return jsonResponse_({
      status: "error",
      message: "Unable to check in. Please try again."
    });
  } finally {
    if (hasLock) {
      lock.releaseLock();
    }
  }
}

/**
 * One-time authorization helper for the deployment owner.
 * Run this manually after the first deployment so the web app can access the
 * target spreadsheet. It does not write any data.
 */
function authorizeCheckin() {
  var spreadsheet = SpreadsheetApp.openById(
    QR_CHECKIN_CONFIG.spreadsheetId
  );
  var studentSheet = spreadsheet.getSheetByName(
    QR_CHECKIN_CONFIG.studentSheetName
  );

  if (!studentSheet) {
    throw new Error("Student sheet is missing.");
  }

  return studentSheet.getRange(1, 1).getDisplayValue();
}

function readRequestCode_(e) {
  var rawCode = "";

  if (e && e.parameter && e.parameter.code) {
    rawCode = e.parameter.code;
  } else if (e && e.postData && e.postData.contents) {
    try {
      var parsed = JSON.parse(e.postData.contents);
      rawCode = parsed.code || "";
    } catch (error) {
      rawCode = "";
    }
  }

  return normalizeCode_(rawCode);
}

function normalizeCode_(value) {
  var code = String(value || "").trim();

  if (!code || code.length > 128) {
    return "";
  }

  var urlMatch = code.match(/[?&]code=([^&#]+)/i);

  if (urlMatch) {
    try {
      code = decodeURIComponent(urlMatch[1].replace(/\+/g, " "));
    } catch (error) {
      return "";
    }
  }

  return code.trim().toUpperCase();
}

function findHeaderColumn_(headers, acceptedHeaders) {
  var normalizedHeaders = headers.map(function(header) {
    return String(header || "").trim().toLowerCase();
  });

  for (var i = 0; i < acceptedHeaders.length; i++) {
    var candidate = String(acceptedHeaders[i]).trim().toLowerCase();
    var index = normalizedHeaders.indexOf(candidate);

    if (index !== -1) {
      return index;
    }
  }

  return -1;
}

function findExactCode_(sheet, oneBasedColumn, code) {
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  return sheet
    .getRange(2, oneBasedColumn, lastRow - 1, 1)
    .createTextFinder(code)
    .matchCase(false)
    .matchEntireCell(true)
    .matchFormulaText(false)
    .findNext();
}

function isDuplicateCode_(logSheet, code) {
  var lastRow = logSheet.getLastRow();

  if (lastRow < 2) {
    return false;
  }

  return Boolean(
    logSheet
      .getRange(2, 2, lastRow - 1, 1)
      .createTextFinder(code)
      .matchCase(false)
      .matchEntireCell(true)
      .matchFormulaText(false)
      .findNext()
  );
}

function assertLogSchema_(logSheet) {
  var currentHeaders = logSheet
    .getRange(1, 1, 1, QR_CHECKIN_CONFIG.logHeaders.length)
    .getDisplayValues()[0];

  for (var i = 0; i < QR_CHECKIN_CONFIG.logHeaders.length; i++) {
    if (currentHeaders[i] !== QR_CHECKIN_CONFIG.logHeaders[i]) {
      throw new Error("The qrcode-scan header row is invalid.");
    }
  }
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
