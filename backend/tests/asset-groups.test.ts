import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assetGroupOf, groupFor, type Asset } from '../contracts/domain';
import { createAssetWorkbook } from '../../frontend/services/excel-export';

test('หมวดจัดจากชื่อรายการ เจอคำค้นแรกก่อน ไม่ตรงคำใดเป็น "รอจัดหมวด"', () => {
  assert.equal(assetGroupOf('โต๊ะคอมพิวเตอร์'), 'โต๊ะ');                       // โต๊ะมาก่อนคอมพิวเตอร์
  assert.equal(assetGroupOf('เครื่องคอมพิวเตอร์ All in One'), 'คอมพิวเตอร์และโน้ตบุ๊ก');
  assert.equal(assetGroupOf('ตู้ลำโพงขยายเสียง'), 'เครื่องเสียงและไมโครโฟน');    // ตู้ลำโพงไม่ใช่ตู้
  assert.equal(assetGroupOf('เครื่องวัดอุณหภูมิแบบลำแสงอินฟาเรด'), 'เครื่องมือวัดและทดสอบ');
  assert.equal(assetGroupOf('ของที่ไม่รู้จัก'), 'รอจัดหมวด');
});

test('หมวดที่บันทึกไว้ใช้ตามนั้น (รวมหมวดที่ตั้งเอง) ว่างหรือ "รอจัดหมวด" จึงจัดจากชื่อรายการ', () => {
  assert.equal(groupFor({ groupName: 'กลุ่มที่เจ้าหน้าที่ตั้งเอง', name: 'โต๊ะทำงาน' }), 'กลุ่มที่เจ้าหน้าที่ตั้งเอง');
  assert.equal(groupFor({ groupName: 'ตู้และชั้นวาง', name: 'โต๊ะทำงาน' }), 'ตู้และชั้นวาง');
  assert.equal(groupFor({ groupName: '', name: 'โต๊ะทำงาน' }), 'โต๊ะ');
  assert.equal(groupFor({ groupName: 'รอจัดหมวด', name: 'เครื่องวัดอุณหภูมิ' }), 'เครื่องมือวัดและทดสอบ');
});

test('Export ช่องหมวดเป็นหมวดที่รู้จัก ช่องสำนักงานเป็นประเภทครุภัณฑ์', async () => {
  const a = { id: '1', code: 'M-1', name: 'เครื่องวัดอุณหภูมิ-ความชื้นระบบดิจิตอล', quantity: 1, unitSatang: 7150000, totalSatang: 7150000,
    notes: '', location: 'อ.ปฏิบัติการ', branch: 'คจก', groupName: '',
    category: 'ครุภัณฑ์การแพทย์และวิทยาศาสตร์', lifecycle: 'active', condition: 'normal' } as unknown as Asset;
  const s = (await createAssetWorkbook([a], { fiscalYear: 2570 })).worksheets[0];
  assert.equal(s.getCell('I6').value, 'เครื่องมือวัดและทดสอบ');
  assert.equal(s.getCell('J6').value, 'ครุภัณฑ์การแพทย์และวิทยาศาสตร์');
  assert.equal(s.getCell('J6').alignment.shrinkToFit, true);   // ข้อความยาวย่อให้พอดีช่อง ไม่ล้นพื้นที่พิมพ์
});
