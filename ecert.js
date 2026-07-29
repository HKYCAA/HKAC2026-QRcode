function importFileLinks() {
  var sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getActiveSheet();

  var folderId = "1kvaXJlGm_E0-HfiPgEEDDBLYc9nFqEnB";
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();

  var startRow = 2;
  var lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    SpreadsheetApp.getUi().alert("工作表沒有資料。");
    return;
  }

  var numRows = lastRow - startRow + 1;

  var colA = sheet
    .getRange(startRow, 1, numRows, 1)
    .getDisplayValues();

  var colE = sheet
    .getRange(startRow, 5, numRows, 1)
    .getDisplayValues();

  // 讀取 folder 內所有檔案
  var fileList = [];

  while (files.hasNext()) {
    var file = files.next();
    var fileName = file.getName().trim();

    fileList.push({
      name: fileName,
      normalizedName: normalizeText_(fileName),
      url: file.getUrl()
    });

    Logger.log("Folder file: " + fileName);
  }

  if (fileList.length === 0) {
    SpreadsheetApp.getUi().alert(
      "指定資料夾內讀取不到任何檔案。請檢查 Folder ID 或存取權限。"
    );
    return;
  }

  var updatedCount = 0;
  var skippedCount = 0;
  var notFound = [];

  for (var i = 0; i < numRows; i++) {
    var rowNumber = startRow + i;
    var code = String(colA[i][0] || "").trim();
    var existingColE = String(colE[i][0] || "").trim();

    // Col A 冇資料 → skip
    if (code === "") {
      skippedCount++;
      continue;
    }

    // Col E 已經有任何內容／link → skip
    if (existingColE !== "") {
      skippedCount++;
      continue;
    }

    var normalizedCode = normalizeText_(code);

    // 檔名只要包含 Code 就配對
    var matchedFile = fileList.find(function(fileInfo) {
      return fileInfo.normalizedName.indexOf(normalizedCode) !== -1;
    });

    if (matchedFile) {
      // Col D：檔案名稱
      sheet.getRange(rowNumber, 4).setValue(matchedFile.name);

      // Col E：Drive link
      sheet.getRange(rowNumber, 5).setFormula(
        '=HYPERLINK("' +
        matchedFile.url +
        '","' +
        matchedFile.url +
        '")'
      );

      updatedCount++;
    } else {
      notFound.push("第 " + rowNumber + " 行：" + code);
    }
  }

  if (notFound.length > 0) {
    Logger.log(
      "以下 Code 搵唔到對應檔案：\n" +
      notFound.join("\n")
    );
  }

  SpreadsheetApp.getUi().alert(
    "完成！\n" +
    "Folder 內檔案數量：" + fileList.length + "\n" +
    "已寫入 Col D 及 E：" + updatedCount + " 行\n" +
    "已跳過：" + skippedCount + " 行\n" +
    "搵唔到：" + notFound.length + " 個"
  );
}

function normalizeText_(text) {
  return String(text || "")
    .toUpperCase()
    .replace(/\.[^.]+$/, "")  // 移除副檔名
    .replace(/[\s_\-()（）]/g, ""); // 忽略空格、底線、括號及連字號
}