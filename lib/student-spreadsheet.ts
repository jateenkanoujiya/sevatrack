// This parser runs only when an administrator chooses a workbook; no file is uploaded.
export async function parseStudentWorkbook(buffer:ArrayBuffer){
 if(buffer.byteLength>2*1024*1024)throw new Error('File must be under 2 MB.');
 const module=await import('exceljs'),Excel=module.default||module,book=new Excel.Workbook();
 await book.xlsx.load(buffer);
 const sheet=book.getWorksheet('Students')||book.worksheets[0];
 if(!sheet)throw new Error('The workbook has no Students sheet.');
 if(sheet.actualRowCount>201||sheet.columnCount>20)throw new Error('Use at most 200 students and only the template columns.');
 const cells:string[][]=[];
 sheet.eachRow((r:any)=>{cells.push(r.values.slice(1).map((v:any)=>{
  if(v&&typeof v==='object'){
   if(v.richText)return v.richText.map((x:any)=>x.text).join('');
   if(v.hyperlink&&typeof v.text==='string')return v.text;
   throw new Error('Use plain values, not formulas or dates. Format identifiers as Text.');
  }
  return String(v??'').trim();
 }))});
 return cells;
}
