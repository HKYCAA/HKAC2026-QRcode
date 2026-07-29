function myFunction() {
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var s=ss.getActiveSheet();
  var c=s.getActiveCell();
  var fldr=DriveApp.getFolderById("1kvaXJlGm_E0-HfiPgEEDDBLYc9nFqEnB");
  var files=fldr.getFiles();
  var names=[],f,str;
  while (files.hasNext()) {
    f=files.next();
    str='=hyperlink("' + f.getName() + '","' + f.getName() + '")';
    names.push([str]);
  }
  s.getRange(c.getRow(),c.getColumn(),names.length).setFormulas(names);
}