import { thaiDateOnly } from '@/shared/domain';

// วันที่สั้นแบบไทย + เวลาที่ผ่านมา เช่น { main: '18 ต.ค. 69', sub: '3 ชม.ที่แล้ว' }
// ใช้ในการ์ดมือถือของหน้าทะเบียน และกระดิ่งแจ้งเตือน · มีวันที่รับ (receivedDate) จะแสดง "รับ: …" แทน
export function formatImportDate(isoStr?: string, receivedDate?: string) {
  if (!isoStr && !receivedDate) return { main: '—', sub: '' };
  try {
    const d = isoStr ? new Date(isoStr) : null;
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    let main = '—';
    let sub = '';

    if (d && !isNaN(d.getTime())) {
      const day = d.getDate();
      const month = months[d.getMonth()];
      const year = (d.getFullYear() + 543) % 100;
      main = `${day} ${month} ${year}`;

      const diffMs = Date.now() - d.getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) sub = 'เมื่อสักครู่';
      else if (mins < 60) sub = `${mins} น.ที่แล้ว`;
      else {
        const hours = Math.floor(mins / 60);
        if (hours < 24) sub = `${hours} ชม.ที่แล้ว`;
        else {
          const days = Math.floor(hours / 24);
          if (days === 1) sub = 'เมื่อวานนี้';
          else if (days < 30) sub = `${days} วันที่แล้ว`;
          else sub = `${Math.floor(days / 30)} ด.ที่แล้ว`;
        }
      }
    } else if (receivedDate) {
      main = thaiDateOnly(receivedDate);
    }

    if (receivedDate && receivedDate !== main) {
      sub = `รับ: ${thaiDateOnly(receivedDate)}`;
    }

    return { main, sub };
  } catch {
    return { main: isoStr || receivedDate || '—', sub: '' };
  }
}
