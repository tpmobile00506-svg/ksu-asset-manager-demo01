import { json, type Transaction } from '../../db/client';
import { type Asset } from '../../contracts/domain';
import { trace } from '../../debug/trace';

// รอบตรวจนับที่เปิดอยู่ต้องตามทะเบียนให้ทัน (ผู้ใช้เลือกแบบ ก. 8 พ.ย. 2569)
// เดิมรอบเก็บสำเนาทะเบียน ณ ตอนเปิดรอบอย่างเดียว: แยกรายชิ้นระหว่างรอบแล้วสแกน QR ชิ้นใหม่ไม่เจอ
// และต้องติ๊กรายการเดิมที่ไม่มีแล้วก่อนปิดรอบ
// แตะเฉพาะรายการที่ "ยังไม่ได้ตรวจ" ในรอบที่ "ยังเปิดอยู่" · ตรวจไปแล้ว = ผลนับคงเดิม ไม่แก้ย้อนหลัง

type SnapshotSource = Pick<Asset, 'code' | 'name' | 'quantity' | 'location' | 'branch'> & {
  totalSatang: number | bigint;
};

// สำเนาข้อมูลครุภัณฑ์ในรอบตรวจนับ (ใช้ตอนเปิดรอบ และตอนใส่รายการใหม่เข้ารอบที่เปิดอยู่)
export const stocktakeSnapshot = (a: SnapshotSource) =>
  json({
    code: a.code,
    name: a.name,
    quantity: a.quantity,
    location: a.location,
    branch: a.branch,
    totalSatang: a.totalSatang,
  });

const pendingInOpenRounds = (tx: Transaction, assetIds: string[]) =>
  tx.stocktakeItem.findMany({
    where: { assetId: { in: assetIds }, result: 'pending', round: { status: 'open' } },
  });

// แยกรายการ / แยกเป็นรายชิ้น / แยกตอนอนุมัติคำขอบางส่วน ระหว่างเปิดรอบ:
// รายการเดิมที่ยังไม่ได้ตรวจ → เอาออกจากรอบ แล้วใส่รายการใหม่ทุกรายการแทน (สแกน QR ชิ้นใหม่เจอทันที)
export async function replaceInOpenRounds(
  tx: Transaction,
  parentId: string,
  children: (SnapshotSource & { id: string })[],
) {
  const items = await pendingInOpenRounds(tx, [parentId]);
  for (const item of items) {
    await tx.stocktakeItem.delete({ where: { id: item.id } });
    await tx.stocktakeItem.createMany({
      data: children.map(c => ({
        id: item.roundId + c.id,
        roundId: item.roundId,
        assetId: c.id,
        snapshot: stocktakeSnapshot(c),
      })),
    });
  }
  if (items.length) trace.ok(`รอบตรวจนับที่เปิดอยู่: เอารายการเดิมออก ใส่รายการใหม่ ${children.length} รายการแทน`);
}

// จำหน่ายที่อนุมัติระหว่างเปิดรอบ: เอาออกจากรอบ (ไม่ต้องตรวจของที่จำหน่ายแล้ว)
export async function dropFromOpenRounds(tx: Transaction, assetIds: string[]) {
  const { count } = await tx.stocktakeItem.deleteMany({
    where: { assetId: { in: assetIds }, result: 'pending', round: { status: 'open' } },
  });
  if (count) trace.ok(`รอบตรวจนับที่เปิดอยู่: เอารายการที่จำหน่ายออก ${count} รายการ`);
}

// โอนย้ายที่อนุมัติระหว่างเปิดรอบ: รอบแสดงสถานที่และสาขาใหม่ (ผู้ใช้เลือก 8 พ.ย. 2569)
export async function moveInOpenRounds(tx: Transaction, assetIds: string[], location: string, branch: string) {
  const items = await pendingInOpenRounds(tx, assetIds);
  for (const item of items)
    await tx.stocktakeItem.update({
      where: { id: item.id },
      data: { snapshot: json({ ...JSON.parse(item.snapshot), location, branch }) },
    });
  if (items.length) trace.ok(`รอบตรวจนับที่เปิดอยู่: เปลี่ยนสถานที่เป็นปลายทางใหม่ ${items.length} รายการ`);
}
