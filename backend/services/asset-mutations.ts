// จุดเข้าของคำสั่งบันทึกข้อมูล (POST /api/data) — โค้ดจริงแยกตามเรื่องอยู่ใน services/mutations/
//   index.ts        mutate(): transaction + กันกดซ้ำ + ลองใหม่เมื่อชนกัน + ตารางคำสั่ง (action → ฟังก์ชัน)
//   users.ts        user, workflow
//   assets.ts       create, import, bulkEdit, edit, split, repairComplete, void, restore
//   imports.ts      batchImport, rowOverride · import-files.ts: sourceDelete, sourceArchive
//   funds.ts        fundSave, fundDelete, fundAssign, fundUnassign
//   requests.ts     request, approve, reject, cancelRequest, requestMany, approveMany
//   stocktakes.ts   round, check, closeRound
//   helpers.ts      ตัวช่วยที่ใช้ร่วมกัน · types.ts: MutationContext
export { mutate } from './mutations';
export { codeKey } from '../contracts/domain';
