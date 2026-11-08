import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as stickerDocument from '../contracts/qr-sticker-document';

// รันหน้าต่างพิมพ์สติกเกอร์ QR ของจริงด้วย React จำลอง (ไม่มี DOM/เบราว์เซอร์)
// แทนเทสต์หน้าต่างป้าย A4 เดิม (qr-modal.test.ts) ที่ถูกแทนที่ด้วยสติกเกอร์ 8 พ.ย. 2569
type Node = { type: unknown; props: Record<string, any> };
type StickerAsset = {
  id: string;
  code: string;
  name: string;
  location: string;
  quantity: number;
  serial: string;
  lifecycle: string;
};

function renderModal() {
  const source = readFileSync(
    new URL('../../frontend/features/inventory/qr-sticker-modal.tsx', import.meta.url),
    'utf8',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const states: any[] = [];
  const memos: { deps: unknown[]; value: unknown }[] = [];
  let stateIndex = 0;
  let memoIndex = 0;
  const prints: { list: { asset: StickerAsset; copies: number }[]; size: string }[] = [];
  const savedSizes: string[] = [];
  const jsx = (type: unknown, props: Record<string, any>): Node => ({ type, props });
  const mocks: Record<string, unknown> = {
    react: {
      useState(initial: unknown) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [
          states[index],
          (value: unknown) => {
            states[index] = typeof value === 'function' ? value(states[index]) : value;
          },
        ];
      },
      useMemo(factory: () => unknown, deps: unknown[]) {
        const index = memoIndex++;
        const previous = memos[index];
        if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i])))
          memos[index] = { deps, value: factory() };
        return memos[index].value;
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'lucide-react': { Minus: 'Minus', Plus: 'Plus', Printer: 'Printer', Search: 'Search' },
    '@/components/ui/button': { Button: 'Button' },
    '@/components/ui/input': { Input: 'Input' },
    '@/components/ui/dialog': Object.fromEntries(
      ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription'].map(name => [name, name]),
    ),
    '@/frontend/components/common': { Pick: 'Pick' },
    '@/shared/qr-sticker-document': stickerDocument,
    './sticker-preview': { default: 'StickerPreview' },
    './qr-sticker': {
      printStickers: async (list: any, size: string) => {
        prints.push({ list, size });
        return true;
      },
      savedStickerSize: () => '60x40',
      saveStickerSize: (size: string) => savedSizes.push(size),
    },
  };
  const cjs = { exports: {} as { default: (props: unknown) => Node } };
  runInNewContext(code, {
    module: cjs,
    exports: cjs.exports,
    require(name: string) {
      assert.ok(name in mocks, `Unexpected component import: ${name}`);
      return mocks[name];
    },
  });
  return {
    prints,
    savedSizes,
    // วาดซ้ำจนค่าคงที่ (ตั้งค่าระหว่างวาดตอนเปิดหน้าต่างใหม่ เหมือน React วาดรอบถัดไป)
    render(props: { open: boolean; assets: StickerAsset[]; initial: StickerAsset[]; token?: string }) {
      let tree!: Node;
      for (let i = 0; i < 3; i++) {
        stateIndex = 0;
        memoIndex = 0;
        tree = cjs.exports.default({ ...props, onClose() {} });
      }
      return tree;
    },
  };
}

function nodes(tree: unknown, match: (node: Node) => boolean): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, match));
  if (!tree || typeof tree !== 'object') return [];
  const node = tree as Node;
  return [...(match(node) ? [node] : []), ...nodes(node.props?.children, match)];
}
const text = (tree: unknown): string => {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return text((tree as Node).props?.children);
};
const byLabel = (tree: Node, label: string) => {
  const [found] = nodes(tree, n => n.props?.['aria-label'] === label);
  assert.ok(found, `ไม่พบ ${label}`);
  return found;
};
const footer = (tree: Node) => nodes(tree, n => n.props?.className?.includes?.('qr-print-bar'))[0];
const printButton = (tree: Node) => nodes(footer(tree), n => n.type === 'Button')[0];
const rowCodes = (tree: Node) =>
  nodes(tree, n => n.type === 'li').map(li => text(nodes(li, n => n.props?.className?.includes?.('font-mono'))[0]));

const asset = (code: string, extra: Partial<StickerAsset> = {}): StickerAsset => ({
  id: 'id-' + code,
  code,
  name: 'รายการ ' + code,
  location: 'ห้อง 301',
  quantity: 1,
  serial: '',
  lifecycle: 'active',
  ...extra,
});
const a2 = asset('A-2'),
  a10 = asset('A-10'),
  b1 = asset('B-1', { quantity: 20 });
// A-1 เป็นประวัติการแยกรายการ (ไม่ได้ใช้อยู่) จึงต้องไม่อยู่ในรายการให้เลือกพิมพ์
const all = [a10, b1, asset('A-1', { lifecycle: 'split' }), a2];

test('เปิดจากรายการที่ติ๊กในทะเบียน: เลือกไว้ให้ดวงละ 1 แสดงเฉพาะที่เลือก เรียงเลขแบบตัวเลข ขนาดใช้ค่าที่จำไว้', () => {
  const modal = renderModal();
  const tree = modal.render({ open: true, assets: all, initial: [a10, a2], token: 't1' });
  // A-2 ก่อน A-10 (เรียงแบบตัวเลข) · B-1 ไม่ได้เลือกจึงไม่แสดง
  assert.deepEqual(rowCodes(tree), ['A-2', 'A-10']);
  assert.match(text(footer(tree)), /เลือก 2 รายการ · รวม 2 ดวง/);
  assert.equal(nodes(tree, n => n.type === 'Pick')[0].props.value, '60x40');
  assert.equal(printButton(tree).props.disabled, false);
});

test('จำนวนดวง: กดเพิ่ม/ลด และพิมพ์เองได้ · ช่องว่างนับเป็น 1 ดวง · ส่งไปพิมพ์ตามลำดับหมายเลข', async () => {
  const modal = renderModal();
  const props = { open: true, assets: all, initial: [a10, a2], token: 't1' };
  let tree = modal.render(props);
  byLabel(tree, 'เพิ่มจำนวนดวงของ A-10').props.onClick();
  byLabel(tree, 'เพิ่มจำนวนดวงของ A-10').props.onClick();
  tree = modal.render(props);
  // A-2 = 1, A-10 = 3 → 4 ดวง
  assert.match(text(footer(tree)), /รวม 4 ดวง/);
  byLabel(tree, 'จำนวนดวงของ A-2').props.onChange({ target: { value: '' } });
  tree = modal.render(props);
  assert.equal(byLabel(tree, 'จำนวนดวงของ A-2').props.value, '');
  assert.match(text(footer(tree)), /รวม 4 ดวง/);
  // ลดต่ำกว่า 1 ไม่ได้
  byLabel(tree, 'ลดจำนวนดวงของ A-2').props.onClick();
  tree = modal.render(props);
  assert.equal(byLabel(tree, 'จำนวนดวงของ A-2').props.value, 1);

  await printButton(tree).props.onClick();
  assert.equal(modal.prints.length, 1);
  assert.equal(modal.prints[0].size, '60x40');
  // อาร์เรย์มาจาก vm อีกชุดหนึ่ง แปลงเป็น JSON ก่อนเทียบ (deepEqual แยก Array คนละ realm)
  assert.deepEqual(JSON.parse(JSON.stringify(modal.prints[0].list.map(x => [x.asset.code, x.copies]))), [
    ['A-2', 1],
    ['A-10', 3],
  ]);
});

test('เกิน 500 ดวงต่อครั้ง: ปุ่มพิมพ์กดไม่ได้และบอกให้แบ่งพิมพ์', () => {
  const modal = renderModal();
  const props = { open: true, assets: all, initial: [a2, b1], token: 't1' };
  let tree = modal.render(props);
  byLabel(tree, 'จำนวนดวงของ B-1').props.onChange({ target: { value: '500' } });
  tree = modal.render(props);
  // 500 + 1 = 501 ดวง
  assert.match(text(footer(tree)), /รวม 501 ดวง เกินครั้งละ 500 ดวง/);
  assert.equal(printButton(tree).props.disabled, true);
  // รายการกลุ่มบอกว่าทุกชิ้นใช้ QR เดียวกัน
  assert.match(text(tree), /20 ชิ้นใช้ QR เดียวกัน/);
});

test('เปิดหน้าต่างใหม่ไม่เหลือรายการที่เลือกจากครั้งก่อน · เลือกทั้งหมดที่ค้นเจอ · เปลี่ยนขนาดแล้วจำไว้', () => {
  const modal = renderModal();
  let tree = modal.render({ open: true, assets: all, initial: [a2, a10], token: 't1' });
  assert.match(text(footer(tree)), /เลือก 2 รายการ/);
  modal.render({ open: false, assets: all, initial: [a2, a10], token: 't1' });
  const props = { open: true, assets: all, initial: [], token: 't2' };
  tree = modal.render(props);
  assert.match(text(footer(tree)), /เลือก 0 รายการ · รวม 0 ดวง/);
  assert.equal(printButton(tree).props.disabled, true);
  // ไม่ได้ติ๊กมาจากทะเบียน → แสดงทุกรายการ
  assert.deepEqual(rowCodes(tree), ['A-2', 'A-10', 'B-1']);

  nodes(tree, n => n.type === 'Input')[0].props.onChange({ target: { value: 'a-' } });
  tree = modal.render(props);
  assert.deepEqual(rowCodes(tree), ['A-2', 'A-10']);
  const selectAll = nodes(tree, n => n.type === 'input' && n.props.type === 'checkbox')[0];
  selectAll.props.onChange();
  tree = modal.render(props);
  assert.match(text(footer(tree)), /เลือก 2 รายการ · รวม 2 ดวง/);

  nodes(tree, n => n.type === 'Pick')[0].props.onChange('40x30');
  nodes(tree, n => n.type === 'Pick')[0].props.onChange('A4');
  tree = modal.render(props);
  assert.equal(nodes(tree, n => n.type === 'Pick')[0].props.value, '40x30');
  assert.deepEqual(modal.savedSizes, ['40x30']);
});

// ภาพตัวอย่างสติกเกอร์: ระหว่างรอสร้าง QR ของรายการใหม่ ต้องไม่แสดง QR ของรายการก่อนหน้า
test('ตัวอย่างสติกเกอร์ไม่แสดง QR ของรายการก่อนหน้า ระหว่างรอ QR ของรายการใหม่', async () => {
  const source = readFileSync(
    new URL('../../frontend/features/inventory/sticker-preview.tsx', import.meta.url),
    'utf8',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const states: any[] = [];
  const effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  let stateIndex = 0,
    effectIndex = 0,
    pending: (() => void)[] = [];
  const waiting = new Map<string, (url: string) => void>();
  const jsx = (type: unknown, props: Record<string, any>): Node => ({ type, props });
  const cjs = { exports: {} as { default: (props: unknown) => Node } };
  runInNewContext(code, {
    module: cjs,
    exports: cjs.exports,
    require(name: string) {
      if (name === 'react')
        return {
          useState(initial: unknown) {
            const index = stateIndex++;
            if (!(index in states)) states[index] = initial;
            return [states[index], (value: unknown) => (states[index] = value)];
          },
          useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
            const index = effectIndex++;
            const previous = effects[index];
            if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i])))
              pending.push(() => {
                previous?.cleanup?.();
                effects[index] = { deps, cleanup: effect() };
              });
          },
        };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === '@/shared/qr-sticker-document') return stickerDocument;
      if (name === './qr-sticker')
        return { stickerQr: (id: string) => new Promise<string>(resolve => waiting.set(id, resolve)) };
      throw new Error('Unexpected import ' + name);
    },
  });
  const render = (a: StickerAsset) => {
    stateIndex = 0;
    effectIndex = 0;
    pending = [];
    const tree = cjs.exports.default({ asset: a, size: '50x30' });
    pending.forEach(run => run());
    return nodes(tree, n => !!n.props?.dangerouslySetInnerHTML)[0].props.dangerouslySetInnerHTML.__html as string;
  };
  const settle = () => new Promise<void>(resolve => setImmediate(resolve));

  render(a2);
  waiting.get(a2.id)!('data:qr-of-A-2');
  await settle();
  assert.ok(render(a2).includes('data:qr-of-A-2'));
  // เปลี่ยนเป็น A-10: QR ยังสร้างไม่เสร็จ → ช่อง QR เป็นสี่เหลี่ยมเทา ไม่ใช่ QR ของ A-2
  const switching = render(a10);
  assert.equal(switching.includes('data:qr-of-A-2'), false);
  assert.ok(switching.includes('alt="QR A-10"'));
  // QR ของ A-10 เสร็จแล้วจึงแสดง
  waiting.get(a10.id)!('data:qr-of-A-10');
  await settle();
  assert.ok(render(a10).includes('data:qr-of-A-10'));
});
