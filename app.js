import { API_URL } from "./config.js";
import { normalizeScannedCode, resultPresentation } from "./core.js";

const elements = {
  form: document.querySelector("#manual-form"),
  input: document.querySelector("#manual-code"),
  submit: document.querySelector("#manual-submit"),
  result: document.querySelector("#result"),
  resultTitle: document.querySelector("#result-title"),
  resultDetail: document.querySelector("#result-detail"),
  undo: document.querySelector("#undo-checkin")
};

let isProcessing = false;
let ignoredScanCode = "";
let lastSuccessfulScanAt = 0;
let scanFlashTimer;
let undoableCode = "";
let scanner;

function setResult(presentation) {
  elements.result.className = `result result--${presentation.state}`;
  elements.resultTitle.textContent = presentation.title;
  elements.resultDetail.textContent = presentation.detail;
}

function syncSubmitAvailability() {
  const hasCode = Boolean(normalizeScannedCode(elements.input.value));
  elements.submit.disabled = isProcessing || !hasCode;
}

function setProcessing(processing, submittingCode = "") {
  isProcessing = processing;
  elements.form.setAttribute("aria-busy", String(processing));
  elements.submit.textContent =
    processing && submittingCode
      ? `Submitting ${submittingCode}…`
      : "Check in";
  syncSubmitAvailability();
  elements.undo.disabled = processing;
}

function flashScannedInput() {
  window.clearTimeout(scanFlashTimer);
  elements.input.classList.remove("scan-flash");

  window.requestAnimationFrame(() => {
    elements.input.classList.add("scan-flash");
    scanFlashTimer = window.setTimeout(() => {
      elements.input.classList.remove("scan-flash");
    }, 1000);
  });
}

function setUndoableCode(code) {
  undoableCode = normalizeScannedCode(code);
  elements.undo.hidden = !undoableCode;
  elements.undo.disabled = isProcessing;
}

async function postAction(action, code) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: new URLSearchParams({ action, code }),
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

async function submitCode(rawCode) {
  if (isProcessing) {
    return;
  }

  const code = normalizeScannedCode(rawCode);

  if (!code) {
    setResult(resultPresentation({ status: "invalid" }));
    elements.input.focus();
    return;
  }

  if (!API_URL.startsWith("https://script.google.com/macros/s/")) {
    setResult(resultPresentation({ status: "error" }));
    elements.resultDetail.textContent =
      "The check-in endpoint has not been configured.";
    return;
  }

  ignoredScanCode = code;
  elements.input.value = "";
  setUndoableCode("");
  setProcessing(true, code);
  setResult({
    state: "loading",
    title: "Checking in…",
    detail: `${code} — the camera is ready for the next QR code.`
  });

  try {
    const payload = await postAction("checkin", code);
    setResult(resultPresentation(payload));

    if (payload.status === "success" || payload.status === "duplicate") {
      setUndoableCode(payload.code || code);
    }
  } catch (error) {
    console.error("Check-in request failed", error);
    setResult(resultPresentation({ status: "error" }));
  } finally {
    setProcessing(false);
  }
}

async function undoCheckin() {
  const code = undoableCode;

  if (
    isProcessing ||
    !code ||
    !window.confirm(`Undo check-in for ${code}?`)
  ) {
    return;
  }

  setProcessing(true);
  setResult({
    state: "loading",
    title: "Undoing check-in…",
    detail: code
  });

  try {
    const payload = await postAction("undo", code);
    setResult(resultPresentation(payload));

    if (payload.status === "undone" || payload.status === "not_checked_in") {
      setUndoableCode("");
    }
  } catch (error) {
    console.error("Undo request failed", error);
    setResult(resultPresentation({ status: "error" }));
  } finally {
    setProcessing(false);
  }
}

function onScanSuccess(decodedText) {
  const code = normalizeScannedCode(decodedText);
  lastSuccessfulScanAt = Date.now();

  if (!code || code === ignoredScanCode) {
    return;
  }

  ignoredScanCode = "";

  if (elements.input.value === code) {
    return;
  }

  elements.input.value = code;
  flashScannedInput();
  syncSubmitAvailability();

  if (!isProcessing) {
    setResult({
      state: "idle",
      title: "Code ready",
      detail: `${code} — press Check in to record attendance.`
    });
  }
}

function onScanFailure() {
  if (
    ignoredScanCode &&
    Date.now() - lastSuccessfulScanAt > 1000
  ) {
    ignoredScanCode = "";
  }
}

async function initializeScanner() {
  if (!window.Html5Qrcode) {
    setResult(resultPresentation({ status: "error" }));
    elements.resultDetail.textContent =
      "The camera scanner could not load. Use manual entry.";
    return;
  }

  scanner = new window.Html5Qrcode("reader", {
    formatsToSupport: [window.Html5QrcodeSupportedFormats.QR_CODE]
  });

  try {
    await scanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox(viewfinderWidth, viewfinderHeight) {
          const edge = Math.floor(
            Math.min(viewfinderWidth, viewfinderHeight) * 0.72
          );
          return { width: edge, height: edge };
        },
        aspectRatio: 1
      },
      onScanSuccess,
      onScanFailure
    );
  } catch (error) {
    console.error("Camera could not start", error);
    setResult(resultPresentation({ status: "error" }));
    elements.resultDetail.textContent =
      "Allow camera access or use manual entry.";
  }
}

elements.form.addEventListener("submit", event => {
  event.preventDefault();
  void submitCode(elements.input.value);
});

elements.input.addEventListener("input", () => {
  elements.input.classList.remove("scan-flash");
  syncSubmitAvailability();
});

elements.undo.addEventListener("click", () => {
  void undoCheckin();
});

syncSubmitAvailability();
initializeScanner();
