import test from "node:test";
import assert from "node:assert/strict";

import { normalizeScannedCode, resultPresentation } from "../core.js";

test("normalizes a raw code", () => {
  assert.equal(normalizeScannedCode(" ydn0103 "), "YDN0103");
});

test("extracts only the leading unique code from a student QR payload", () => {
  assert.equal(
    normalizeScannedCode("YDQ0621 盧珮淇 Asante, Judith Badu"),
    "YDQ0621"
  );
});

test("extracts a code from a QR URL", () => {
  assert.equal(
    normalizeScannedCode("https://example.com/check-in?code=ydn0103"),
    "YDN0103"
  );
});

test("extracts only the code when a QR URL parameter includes a name", () => {
  assert.equal(
    normalizeScannedCode(
      "https://example.com/check-in?code=YDQ0621%20%E7%9B%A7%E7%8F%AE%E6%B7%87"
    ),
    "YDQ0621"
  );
});

test("puts the unique code before the student name on success", () => {
  assert.equal(
    resultPresentation({
      status: "success",
      code: "YDN0103",
      name: "黃浚彥 Wong Raphael Chun Yin"
    }).title,
    "Successfully checked in, YDN0103 黃浚彥 Wong Raphael Chun Yin"
  );
});

test("uses the required duplicate and invalid messages", () => {
  assert.equal(
    resultPresentation({ status: "duplicate" }).title,
    "Already checked in"
  );
  assert.equal(
    resultPresentation({ status: "invalid" }).title,
    "Invalid code"
  );
});
