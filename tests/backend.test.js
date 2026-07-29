import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../QRCheckin.js", import.meta.url),
  "utf8"
);
const context = vm.createContext({
  console,
  Object,
  JSON,
  String,
  Boolean,
  decodeURIComponent,
  ContentService: {
    MimeType: { JSON: "application/json" },
    createTextOutput(body) {
      return {
        body,
        setMimeType() {
          return this;
        }
      };
    }
  },
  SpreadsheetApp: {
    flush() {}
  }
});

vm.runInContext(source, context);

test("backend normalizes codes without changing the sheet", () => {
  assert.equal(context.normalizeCode_(" ydn0103 "), "YDN0103");
  assert.equal(context.normalizeCode_(""), "");
});

test("backend accepts form and JSON request bodies", () => {
  assert.equal(
    context.readRequestCode_({ parameter: { code: "ydn0103" } }),
    "YDN0103"
  );
  assert.equal(
    context.readRequestCode_({
      postData: { contents: JSON.stringify({ code: "ydn0112" }) }
    }),
    "YDN0112"
  );
});

test("backend reads check-in and undo actions", () => {
  assert.deepEqual(
    {
      ...context.readRequestPayload_({
        parameter: { action: "undo", code: "ydq0621" }
      })
    },
    { action: "undo", code: "YDQ0621" }
  );
  assert.deepEqual(
    {
      ...context.readRequestPayload_({
        postData: {
          contents: JSON.stringify({
            action: "checkin",
            code: "ydn0112"
          })
        }
      })
    },
    { action: "checkin", code: "YDN0112" }
  );
});

test("backend resolves exact live sheet headers", () => {
  const headers = ["YC", "Ind/Grp", "Code", "Name Chi", "Chi+Eng"];

  assert.equal(context.findHeaderColumn_(headers, ["Code"]), 2);
  assert.equal(
    context.findHeaderColumn_(headers, ["Chi+Eng", "Name Chi"]),
    4
  );
});

test("undo removes the matching attendance row", () => {
  const rows = [
    ["Timestamp", "Code", "Name", "Source Row"],
    ["2026-07-29 17:30:00", "YDQ0621", "盧珮淇 Asante, Judith Badu", "623"]
  ];
  const logSheet = {
    getLastRow() {
      return rows.length;
    },
    getRange(row, column) {
      if (column === 2) {
        return {
          createTextFinder(code) {
            return {
              matchCase() {
                return this;
              },
              matchEntireCell() {
                return this;
              },
              matchFormulaText() {
                return this;
              },
              findNext() {
                const index = rows.findIndex(
                  (values, rowIndex) =>
                    rowIndex > 0 && values[1].toUpperCase() === code.toUpperCase()
                );
                return index === -1 ? null : { getRow: () => index + 1 };
              }
            };
          }
        };
      }

      return {
        getDisplayValues() {
          return [[...rows[row - 1]]];
        }
      };
    },
    deleteRow(row) {
      rows.splice(row - 1, 1);
    }
  };
  const rosterOperations = [];
  const studentSheet = {
    getLastRow() {
      return 1601;
    },
    getLastColumn() {
      return 6;
    },
    getRange(row, column, rowCount, columnCount) {
      if (row === 1) {
        return {
          getDisplayValues() {
            return [["YC", "Code", "Name Chi", "Chi+Eng", "School", "Timestamp"]];
          }
        };
      }

      return {
        clearContent() {
          rosterOperations.push(["clear", row, column]);
          return this;
        },
        setBackground(color) {
          rosterOperations.push([
            "background",
            row,
            column,
            rowCount,
            columnCount,
            color
          ]);
          return this;
        }
      };
    }
  };

  const response = context.undoCheckin_(
    studentSheet,
    logSheet,
    "YDQ0621"
  );
  const payload = JSON.parse(response.body);

  assert.equal(payload.status, "undone");
  assert.equal(payload.code, "YDQ0621");
  assert.equal(payload.name, "盧珮淇 Asante, Judith Badu");
  assert.equal(rows.length, 1);
  assert.deepEqual(rosterOperations, [
    ["clear", 623, 6],
    ["background", 623, 1, 1, 6, null]
  ]);
});

test("successful roster update writes timestamp and colors the full row", () => {
  const operations = [];
  const studentSheet = {
    getLastColumn() {
      return 6;
    },
    getRange(row, column, rowCount, columnCount) {
      return {
        setValue(value) {
          operations.push(["value", row, column, value]);
          return this;
        },
        setNumberFormat(format) {
          operations.push(["format", row, column, format]);
          return this;
        },
        setBackground(color) {
          operations.push([
            "background",
            row,
            column,
            rowCount,
            columnCount,
            color
          ]);
          return this;
        }
      };
    }
  };
  const timestamp = new Date("2026-07-29T10:30:00.000Z");

  context.markStudentCheckedIn_(studentSheet, 623, 6, timestamp);

  assert.deepEqual(operations, [
    ["value", 623, 6, timestamp],
    ["format", 623, 6, "yyyy-mm-dd hh:mm:ss"],
    ["background", 623, 1, 1, 6, "#b7e1cd"]
  ]);
});
