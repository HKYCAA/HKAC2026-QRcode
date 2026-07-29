export function normalizeScannedCode(value) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const queryCode = url.searchParams.get("code");

      if (queryCode) {
        return normalizeCodeToken(queryCode);
      }
    } catch {
      return "";
    }
  }

  return normalizeCodeToken(raw);
}

function normalizeCodeToken(value) {
  const code = String(value).trim().split(/\s+/, 1)[0];
  return code && code.length <= 128 ? code.toUpperCase() : "";
}

export function resultPresentation(payload) {
  const status = payload?.status;

  if (status === "success") {
    const code = String(payload.code || "").trim();
    const name = String(payload.name || "").trim();
    const identity = [code, name].filter(Boolean).join(" ");

    return {
      state: "success",
      title: identity
        ? `Successfully checked in, ${identity}`
        : "Successfully checked in",
      detail: "Attendance has been recorded."
    };
  }

  if (status === "duplicate") {
    return {
      state: "duplicate",
      title: "Already checked in",
      detail: "No second attendance record was created."
    };
  }

  if (status === "invalid") {
    return {
      state: "invalid",
      title: "Invalid code",
      detail: "This code was not found. Check the QR code or enter it again."
    };
  }

  if (status === "undone") {
    const code = String(payload.code || "").trim();
    const name = String(payload.name || "").trim();
    const identity = [code, name].filter(Boolean).join(" ");

    return {
      state: "undone",
      title: "Check-in undone",
      detail: identity || "The attendance record was removed."
    };
  }

  if (status === "not_checked_in") {
    return {
      state: "invalid",
      title: "Not checked in",
      detail: "No active attendance record was found for this code."
    };
  }

  return {
    state: "error",
    title: "Unable to check in",
    detail: "Please check the connection and try again."
  };
}
