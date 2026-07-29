import { API_URL } from "./config.js";
import { normalizeScannedCode, resultPresentation } from "./core.js";

const elements = {
  form: document.querySelector("#manual-form"),
  input: document.querySelector("#manual-code"),
  submit: document.querySelector("#manual-submit"),
  result: document.querySelector("#result"),
  resultTitle: document.querySelector("#result-title"),
  resultDetail: document.querySelector("#result-detail"),
  nextScan: document.querySelector("#next-scan")
};

let isProcessing = false;
let scanner;

function setResult(presentation) {
  elements.result.className = `result result--${presentation.state}`;
  elements.resultTitle.textContent = presentation.title;
  elements.resultDetail.textContent = presentation.detail;
}

function setFormDisabled(disabled) {
  elements.input.disabled = disabled;
  elements.submit.disabled = disabled;
}

function pauseScanner() {
  try {
    scanner?.pause(true);
  } catch {
    // The camera may not have started yet; manual entry still works.
  }
}

function resumeScanner() {
  try {
    scanner?.resume();
  } catch {
    // The built-in scanner controls remain available if resume is not ready.
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

  isProcessing = true;
  setFormDisabled(true);
  pauseScanner();
  elements.nextScan.hidden = true;
  setResult({
    state: "loading",
    title: "Checking in…",
    detail: code
  });

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: new URLSearchParams({ code }),
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    setResult(resultPresentation(payload));
  } catch (error) {
    console.error("Check-in request failed", error);
    setResult(resultPresentation({ status: "error" }));
  } finally {
    window.clearTimeout(timeout);
    elements.nextScan.hidden = false;
  }
}

function resetForNextScan() {
  isProcessing = false;
  elements.input.value = "";
  setFormDisabled(false);
  elements.nextScan.hidden = true;
  setResult({
    state: "idle",
    title: "Ready to scan",
    detail: "Point the camera at a QR code or enter a code manually."
  });
  resumeScanner();
}

function onScanSuccess(decodedText) {
  void submitCode(decodedText);
}

function initializeScanner() {
  if (!window.Html5QrcodeScanner) {
    setResult(resultPresentation({ status: "error" }));
    elements.resultDetail.textContent =
      "The camera scanner could not load. Use manual entry.";
    return;
  }

  scanner = new window.Html5QrcodeScanner(
    "reader",
    {
      fps: 10,
      qrbox(viewfinderWidth, viewfinderHeight) {
        const edge = Math.floor(
          Math.min(viewfinderWidth, viewfinderHeight) * 0.72
        );
        return { width: edge, height: edge };
      },
      aspectRatio: 1,
      rememberLastUsedCamera: true,
      showTorchButtonIfSupported: true,
      supportedScanTypes: [
        window.Html5QrcodeScanType.SCAN_TYPE_CAMERA
      ]
    },
    false
  );

  scanner.render(onScanSuccess, () => {});
}

elements.form.addEventListener("submit", event => {
  event.preventDefault();
  void submitCode(elements.input.value);
});

elements.nextScan.addEventListener("click", resetForNextScan);

initializeScanner();
