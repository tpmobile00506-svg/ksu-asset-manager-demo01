import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assetGroupOfType, groupFor, type Asset } from '../contracts/domain';
import { createAssetWorkbook } from '../../frontend/services/excel-export';

// หมวด (กลุ่มต่างๆ) = ชื่อแผ่นงานในไฟล์ต้นฉบับของเจ้าหน้าที่ (ผู้ใช้ตัดสินใจ 16 ต.ค. 2569) เลิกใช้ 19 หมวดย่อยจากชื่อรายการ
test('หมวดคิดจากประเภทครุภัณฑ์ เป็นชื่อแผ่นงานสั้น ไม่รู้จักประเภทเป็น "รอจัดหมวด"', () => {
  assert.equal(assetGroupOfType('ครุภัณฑ์คอมพิวเตอร์'), 'คอม');
  assert.equal(assetGroupOfType('ครุภัณฑ์สำนักงาน'), 'สำนักงาน');
  assert.equal(assetGroupOfType('ครุภัณฑ์โฆษณาและเผยแพร่'), 'โฆษณา');
  assert.equal(assetGroupOfType('ครุภัณฑ์งานบ้านงานครัว'), 'งานครัว');
  assert.equal(assetGroupOfType('คอมพิวเตอร์'), 'คอม');                 // ประเภทที่บันทึกแบบสั้นในข้อมูลเก่า
  assert.equal(assetGroupOfType('รอระบุประเภท'), 'รอจัดหมวด');
  assert.equal(assetGroupOfType(''), 'รอจัดหมวด');
});

test('หมวดไม่ขึ้นกับชื่อรายการหรือหมวดเก่าที่บันทึกไว้', () => {
  assert.equal(groupFor({ category: 'ครุภัณฑ์สำนักงาน' }), 'สำนักงาน');
  assert.equal(groupFor({ category: 'ครุภัณฑ์การแพทย์และวิทยาศาสตร์', groupName: 'เครื่องมือวัดและทดสอบ', name: 'เครื่องวัดอุณหภูมิ' } as Partial<Asset>), 'วิทยาศาสตร์');
});

test('Export ช่องหมวดเป็นชื่อแผ่นงาน ช่องสำนักงานเป็นประเภทครุภัณฑ์ และแผ่นงานใช้ชื่อสั้น', async () => {
  const a = { id: '1', code: 'M-1', name: 'เครื่องวัดอุณหภูมิ-ความชื้นระบบดิจิตอล', quantity: 1, unitSatang: 7150000, totalSatang: 7150000,
    notes: '', location: 'อ.ปฏิบัติการ', branch: 'คจก', groupName: '',
    category: 'ครุภัณฑ์การแพทย์และวิทยาศาสตร์', lifecycle: 'active', condition: 'normal' } as unknown as Asset;
  const s = (await createAssetWorkbook([a], { fiscalYear: 2570 })).worksheets[0];
  assert.equal(s.name, 'วิทยาศาสตร์');
  assert.equal(s.getCell('I6').value, 'วิทยาศาสตร์');
  assert.equal(s.getCell('J6').value, 'ครุภัณฑ์การแพทย์และวิทยาศาสตร์');
  assert.equal(s.getCell('J6').alignment.shrinkToFit, true);   // ข้อความยาวย่อให้พอดีช่อง ไม่ล้นพื้นที่พิมพ์
});
