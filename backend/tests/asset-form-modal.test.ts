import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as domain from '../contracts/domain';
import { readApiResponse } from '../../frontend/components/common';

// Run the actual component handlers with isolated hooks and UI boundaries. This
// catches form wiring regressions without a browser, server, or database write.
const compiled = ts.transpileModule(readFileSync(new URL('../../frontend/features/inventory/asset-form-modal.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

type Element = { type: unknown; props: Record<string, any> };
function mount(kind: 'create' | 'edit' | 'import', asset: Record<string, unknown> = {}, uploadFails = false) {
  const slots: any[] = [];
  let cursor = 0;
  let effects: (() => void)[] = [];
  const writes: any[] = [], uploads: RequestInit[] = [], warnings: string[] = [], errors: string[] = [];
  let reloads = 0;
  const jsx = (type: unknown, props: Element['props']) => ({ type, props });
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: unknown) => { slots[index] = value; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useEffect(effect: () => void, deps: unknown[]) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index][i]))) {
        slots[index] = deps;
        effects.push(effect);
      }
    },
  };
  class BrowserFormData extends FormData {
    constructor(form?: { fields: Record<string, string> }) {
      super();
      if (form) for (const [key, value] of Object.entries(form.fields)) this.set(key, value);
    }
  }
  const signal = new AbortController().signal;
  const common = {
    Pick: 'Pick',
    getSessionSignal: () => signal,
    readApiResponse,
    sessionFetch: async (_url: string, init: RequestInit) => {
      uploads.push(init);
      return uploadFails
        ? Response.json({ error: 'รูปไม่ถูกต้อง' }, { status: 400 })
        : Response.json({ ok: true, imageVersion: 'saved-photo' });
    },
  };
  const module = { exports: {} as any };
  const require = (id: string) => {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (id === '@/shared/domain') return domain;
    if (id === '@/frontend/components/common') return common;
    if (id === 'sonner') return { toast: { error: (message: string) => errors.push(message), warning: (message: string) => warnings.push(message) } };
    return new Proxy({}, { get: (_, name) => name });
  };
  runInNewContext(compiled, { module, exports: module.exports, require, FormData: BrowserFormData, URL });
  const props = {
    open: true, onClose() {},
    modal: { kind, token: 'form-token', sourceId: 'source', row: kind === 'import' ? { key: 'sheet:2' } : undefined, asset },
    data: { assets: [{ branch: 'สาขาจากทะเบียน' }] },
    write: async (body: unknown) => { writes.push(body); return { ok: true, id: 'saved-asset' }; },
    busy: false, setSelected() {}, onPhotoChanged: async () => { reloads++; },
    error: '', setError: (message: string) => errors.push(message),
  };
  let elements: Element[] = [];
  const render = () => {
    cursor = 0;
    effects = [];
    const tree = module.exports.default(props);
    elements = [];
    const walk = (value: any) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(walk); return; }
      elements.push(value);
      walk(value.props?.children);
    };
    walk(tree);
    effects.forEach(effect => effect());
  };
  render();
  render();
  const named = (name: string) => elements.find(element => element.props?.name === name)!;
  return {
    render, named, writes, uploads, warnings, errors,
    elements: () => elements,
    reloads: () => reloads,
    choosePhoto() {
      elements.find(element => element.type === 'input' && element.props.type === 'file')!.props.onChange({
        target: { files: [new File(['synthetic-photo'], 'test.png', { type: 'image/png' })], value: 'test.png' },
      });
      render();
    },
    async submit(overrides: Record<string, string> = {}) {
      const fields = { code: 'TEST', name: 'Test asset', quantity: '2', unitPrice: '10', totalPrice: '20', branch: 'วิทยาศาสตร์', location: 'room', category: 'test', condition: 'damaged', reviewed: 'on', reason: 'ตรวจสอบข้อมูล', ...overrides };
      await elements.find(element => element.type === 'form')!.props.onSubmit({ preventDefault() {}, currentTarget: { fields } });
    },
  };
}

test('asset form preserves custom branches and editable conditions while protecting registered amounts', async () => {
  const form = mount('edit', { id: 'original-id', branch: 'วิทยาศาสตร์', condition: 'normal', quantity: 2, unitSatang: 1000, totalSatang: 2000 });
  assert.equal(form.named('branch').props.defaultValue, 'วิทยาศาสตร์');
  assert.equal(form.named('branch').type, 'Input');
  const options = form.elements().filter(element => element.type === 'option').map(element => element.props.value);
  assert.ok(options.includes('วิทยาศาสตร์'));
  assert.ok(options.includes('สาขาจากทะเบียน'));
  const condition = form.named('condition').props;
  assert.equal(condition.value, undefined);
  assert.equal(condition.defaultValue, 'normal');
  assert.ok(condition.options.some(([value]: string[]) => value === 'damaged'));
  assert.ok(!condition.options.some(([value]: string[]) => value === 'repair'));
  assert.deepEqual(Array.from(mount('edit', { condition: 'repair' }).named('condition').props.options, (option: string[]) => option[0]), ['repair']);
  assert.equal(form.named('lifecycle'), undefined);
  for (const name of ['quantity', 'unitPrice', 'totalPrice']) assert.equal(form.named(name).props.readOnly, true);
  await form.submit({ branch: 'สาขาใหม่ที่พิมพ์เอง', condition: 'damaged' });
  assert.equal(form.writes[0].asset.branch, 'สาขาใหม่ที่พิมพ์เอง');
  assert.equal(form.writes[0].asset.condition, 'damaged');
});

test('automatic form total clears invalid or empty input and recovers using exact cents', () => {
  const form = mount('create', { quantity: 2, unitSatang: 100000, totalSatang: 200000 });
  const change = (name: string, value: string) => { form.named(name).props.onChange({ target: { value } }); form.render(); };
  assert.equal(form.named('totalPrice').props.value, '2000.00');
  for (const invalid of ['', '1e3', '12.345']) {
    change('unitPrice', invalid);
    assert.equal(form.named('totalPrice').props.value, '');
    change('unitPrice', '1,000.00');
    assert.equal(form.named('totalPrice').props.value, '2000.00');
  }
  for (const invalid of ['', '1.5', '1000001']) {
    change('quantity', invalid);
    assert.equal(form.named('totalPrice').props.value, '');
    change('quantity', '2');
    assert.equal(form.named('totalPrice').props.value, '2000.00');
  }
});

test('manual import attaches the chosen image to the returned asset id without resubmitting', async () => {
  for (const fails of [false, true]) {
    const form = mount('import', { code: 'SOURCE-CODE', quantity: 2, unitSatang: 1000, totalSatang: 2000 }, fails);
    form.choosePhoto();
    await form.submit();
    assert.equal(form.writes.length, 1);
    assert.equal(form.writes[0].action, 'import');
    assert.equal(form.uploads.length, 1);
    const photo = form.uploads[0].body as FormData;
    assert.equal(photo.get('assetId'), 'saved-asset');
    assert.equal(photo.get('expectedVersion'), '');
    assert.ok(photo.get('file') instanceof File);
    assert.equal(form.reloads(), fails ? 0 : 1);
    assert.equal(form.warnings.length, fails ? 1 : 0);
    assert.deepEqual(form.errors, []);
  }
});
