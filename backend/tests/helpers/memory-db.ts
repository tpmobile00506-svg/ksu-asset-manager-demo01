// ใส่ฐานข้อมูลจำลอง (object ธรรมดาที่มีเมธอดแบบ Prisma) แทนของจริงระหว่างเทสต์ แล้วคืนฟังก์ชันสำหรับถอดออก
// - ห้ามแตะฐานข้อมูลจริงเด็ดขาด: pool ถูกแทนด้วยตัวที่โยน error ทันทีถ้ามีใครเรียก
// - strict: เรียกเมธอดที่เทสต์ไม่ได้เตรียมไว้ → โยน error (รู้ทันทีว่าโค้ดไปแตะตารางที่ไม่คาดคิด)
//
// ใช้แบบนี้:
//   const restore = installMemoryDatabase({ $transaction: async cb => cb(tx) }, { strict: true });
//   try { ...เรียก mutate()... } finally { restore(); }
export function installMemoryDatabase(client: object, { strict = false } = {}) {
  const cache = globalThis as unknown as { assetPool?: unknown; assetPrisma?: unknown };
  const previous = { pool: cache.assetPool, client: cache.assetPrisma };
  cache.assetPool = new Proxy(
    {},
    {
      get() {
        throw new Error('Real database access is forbidden in this test');
      },
    },
  );
  cache.assetPrisma = strict
    ? new Proxy(client, {
        get(target, property) {
          if (!(property in target)) throw new Error(`Unexpected database method: ${String(property)}`);
          return Reflect.get(target, property);
        },
      })
    : client;
  return () => {
    if (previous.pool === undefined) delete cache.assetPool;
    else cache.assetPool = previous.pool;
    if (previous.client === undefined) delete cache.assetPrisma;
    else cache.assetPrisma = previous.client;
  };
}
