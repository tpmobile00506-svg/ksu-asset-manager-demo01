import type {Source} from '@/shared/domain';
export async function parseWorkbook(file:File):Promise<Source>{
 if(file.size>10*1024*1024)throw Error('ไฟล์ต้องไม่เกิน 10 MB');const module=await import('exceljs/dist/exceljs.min.js');const Excel=module.default;const wb=new Excel.Workbook();await wb.xlsx.load(await file.arrayBuffer());
 const sheets:Source['sheets']=[];let count=0;
 wb.eachSheet(sh=>{const rows:{row:number;values:unknown[]}[]=[];sh.eachRow({includeEmpty:false},r=>{if(++count>20000)throw Error('รองรับไม่เกิน 20,000 แถวต่อไฟล์');const values:unknown[]=[];r.eachCell({includeEmpty:true},(c,i)=>{if(c.isMerged&&c.address!==c.master.address)return;let v=c.value;if(v&&typeof v==='object'){if('formula' in v||'sharedFormula' in v)v={formula:'formula' in v?v.formula:('sharedFormula' in v?v.sharedFormula:''),cached:c.result??null} as any;else if('richText' in v)v=v.richText.map(x=>x.text).join('');else if('text' in v)v=v.text;else if(v instanceof Date)v=v.toISOString();}values[i-1]=v??null;});if(values.some(v=>v!==null))rows.push({row:r.number,values:Array.from(values,v=>v??null)});});sheets.push({name:sh.name,rows});});return {id:'',hash:'',name:file.name,sheets};
}
