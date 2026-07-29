# HKAC2026 QR Code

Google Apps Script utilities attached to the **HKAC 2026 full list** Google
Spreadsheet.

## Files

- `Code.js` — imports filenames from the configured Google Drive folder.
- `ecert.js` — matches spreadsheet codes to Drive files and writes filenames
  and links into columns D and E.
- `appsscript.json` — Apps Script manifest.
- `.clasp.json` — links this checkout to the Apps Script project.

## Requirements

- Node.js
- [`@google/clasp`](https://github.com/google/clasp)
- Access to the linked Google Spreadsheet, Apps Script project, and Drive folder

## Development

Check the authenticated Google account:

```sh
clasp show-authorized-user
```

Pull the latest Apps Script source:

```sh
clasp pull
```

Review files that would be uploaded:

```sh
clasp status
```

Push local changes to Apps Script:

```sh
clasp push
```

Always review the diff before pushing because `clasp push` updates the bound
Apps Script project.
