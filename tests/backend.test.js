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
  decodeURIComponent
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

test("backend resolves exact live sheet headers", () => {
  const headers = ["YC", "Ind/Grp", "Code", "Name Chi", "Chi+Eng"];

  assert.equal(context.findHeaderColumn_(headers, ["Code"]), 2);
  assert.equal(
    context.findHeaderColumn_(headers, ["Chi+Eng", "Name Chi"]),
    4
  );
});
