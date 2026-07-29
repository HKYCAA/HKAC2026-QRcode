var QR_CHECKIN_CONFIG = Object.freeze({
  spreadsheetId: "1SFZvveMY5WqPCQ1uZoyGvOh1CFJpT-nGnqO0tvUbP6s",
  studentSheetName: "all",
  logSheetName: "qrcode-scan",
  codeHeader: "Code",
  timestampHeader: "Timestamp",
  preferredNameHeaders: ["Chi+Eng", "Name Chi", "Name Eng Proper"],
  logHeaders: ["Timestamp", "Code", "Name", "Source Row"],
  checkedInRowColor: "#81c995",
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
    var request = readRequestPayload_(e);
    var requestedCode = request.code;

    if (!requestedCode) {
      return jsonResponse_({
        status: "invalid",
        message: "Invalid code"
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

    if (request.action === "undo") {
      hasLock = lock.tryLock(QR_CHECKIN_CONFIG.lockTimeoutMs);

      if (!hasLock) {
        return busyResponse_();
      }

      return undoCheckin_(studentSheet, logSheet, requestedCode);
    }

    if (request.action !== "checkin") {
      return jsonResponse_({
        status: "error",
        message: "Unsupported action"
      });
    }

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

    hasLock = lock.tryLock(QR_CHECKIN_CONFIG.lockTimeoutMs);

    if (!hasLock) {
      return busyResponse_();
    }

    if (isDuplicateCode_(logSheet, canonicalCode)) {
      return jsonResponse_({
        status: "duplicate",
        message: "Already checked in",
        code: canonicalCode,
        name: studentName
      });
    }

    var checkinTime = new Date();
    var timestampColumn = ensureRosterTimestampColumn_(studentSheet);

    logSheet
      .getRange(logSheet.getLastRow() + 1, 1, 1, 4)
      .setValues([[checkinTime, canonicalCode, studentName, sourceRow]]);
    markStudentCheckedIn_(
      studentSheet,
      sourceRow,
      timestampColumn,
      checkinTime
    );
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
  return readRequestPayload_(e).code;
}

function readRequestPayload_(e) {
  var rawAction = "checkin";
  var rawCode = "";

  if (e && e.parameter) {
    rawAction = e.parameter.action || rawAction;
    rawCode = e.parameter.code || rawCode;
  }

  if (!rawCode && e && e.postData && e.postData.contents) {
    try {
      var parsed = JSON.parse(e.postData.contents);
      rawAction = parsed.action || rawAction;
      rawCode = parsed.code || "";
    } catch (error) {
      rawCode = "";
    }
  }

  return {
    action: String(rawAction).trim().toLowerCase(),
    code: normalizeCode_(rawCode)
  };
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
  return Boolean(findLogMatch_(logSheet, code));
}

function findLogMatch_(logSheet, code) {
  var lastRow = logSheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  return logSheet
    .getRange(2, 2, lastRow - 1, 1)
    .createTextFinder(code)
    .matchCase(false)
    .matchEntireCell(true)
    .matchFormulaText(false)
    .findNext();
}

function undoCheckin_(studentSheet, logSheet, code) {
  var match = findLogMatch_(logSheet, code);

  if (!match) {
    return jsonResponse_({
      status: "not_checked_in",
      message: "No active check-in found",
      code: code
    });
  }

  var row = match.getRow();
  var values = logSheet.getRange(row, 1, 1, 4).getDisplayValues()[0];
  var canonicalCode = normalizeCode_(values[1]);
  var studentName = String(values[2] || "").trim();
  var sourceRow = Number(values[3]);

  logSheet.deleteRow(row);

  if (sourceRow >= 2 && sourceRow <= studentSheet.getLastRow()) {
    clearStudentCheckin_(studentSheet, sourceRow);
  }

  SpreadsheetApp.flush();

  return jsonResponse_({
    status: "undone",
    message: "Check-in undone",
    code: canonicalCode,
    name: studentName
  });
}

function ensureRosterTimestampColumn_(studentSheet) {
  var lastColumn = studentSheet.getLastColumn();
  var headers = studentSheet
    .getRange(1, 1, 1, lastColumn)
    .getDisplayValues()[0];
  var timestampColumn = findHeaderColumn_(headers, [
    QR_CHECKIN_CONFIG.timestampHeader
  ]);

  if (timestampColumn !== -1) {
    return timestampColumn + 1;
  }

  timestampColumn = lastColumn + 1;
  studentSheet
    .getRange(1, timestampColumn)
    .setValue(QR_CHECKIN_CONFIG.timestampHeader);

  return timestampColumn;
}

function markStudentCheckedIn_(
  studentSheet,
  sourceRow,
  timestampColumn,
  checkinTime
) {
  studentSheet
    .getRange(sourceRow, timestampColumn)
    .setValue(checkinTime)
    .setNumberFormat("yyyy-mm-dd hh:mm:ss");
  studentSheet
    .getRange(sourceRow, 1, 1, studentSheet.getLastColumn())
    .setBackground(QR_CHECKIN_CONFIG.checkedInRowColor);
}

function clearStudentCheckin_(studentSheet, sourceRow) {
  var headers = studentSheet
    .getRange(1, 1, 1, studentSheet.getLastColumn())
    .getDisplayValues()[0];
  var timestampColumn = findHeaderColumn_(headers, [
    QR_CHECKIN_CONFIG.timestampHeader
  ]);

  if (timestampColumn !== -1) {
    studentSheet.getRange(sourceRow, timestampColumn + 1).clearContent();
  }

  studentSheet
    .getRange(sourceRow, 1, 1, studentSheet.getLastColumn())
    .setBackground(null);
}

function busyResponse_() {
  return jsonResponse_({
    status: "error",
    message: "Check-in is busy. Please try again."
  });
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
