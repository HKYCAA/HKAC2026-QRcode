import test from "node:test";
import assert from "node:assert/strict";

import { normalizeScannedCode, resultPresentation } from "../core.js";

test("normalizes a raw code", () => {
  assert.equal(normalizeScannedCode(" ydn0103 "), "YDN0103");
});

test("extracts a code from a QR URL", () => {
  assert.equal(
    normalizeScannedCode("https://example.com/check-in?code=ydn0103"),
    "YDN0103"
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
