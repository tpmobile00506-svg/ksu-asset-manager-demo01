import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as domain from '../contracts/domain';

type Element = { type: unknown; props: Record<string, any>; key?: unknown };
type Control = { element: Element; value: string; checked: boolean };

const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const editorCode = compile('../../frontend/features/inventory/editor.tsx');
const fieldCode = compile('../../frontend/features/inventory/asset-form-modal.tsx');
const commonCode = compile('../../frontend/components/common.tsx');

// Execute the actual Editor, Field and Pick. Only hooks and UI primitives are
// isolated; controls retain their native uncontrolled values across rerenders,
// and FormData omits unchecked checkboxes just as the browser does.
function mount(user?: Record<string, unknown>) {
  let cursor = 0;
  const slots: any[] = [];
  let effects: (() => void)[] = [];
  const jsx = (type: unknown, props: Element['props'], key?: unknown): Element =>
    typeof type === 'function' ? type(props) : { type, props, key };
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: unknown) => { slots[index] = value; }];
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
    constructor(form?: { controls: Map<string, Control> }) {
      super();
      for (const [name, control] of form?.controls ?? []) {
        if (control.element.props.disabled) continue;
        if (control.element.type === 'Checkbox') {
          if (control.checked) this.set(name, control.element.props.value ?? 'on');
        } else {
          this.set(name, control.value);
        }
      }
    }
  }
  let common: Record<string, any>, fields: Record<string, any>;
  const require = (id: string) => {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (id === '@/shared/domain') return domain;
    if (id === '@/frontend/components/common') return common;
    if (id === './asset-form-modal') return { ...fields, default: 'AssetFormModal' };
    return new Proxy({}, { get: (_, name) => name });
  };
  const evaluate = (code: string) => {
    const module = { exports: {} as Record<string, any> };
    runInNewContext(code, { module, exports: module.exports, require, FormData: BrowserFormData, AbortController });
    return module.exports;
  };
  common = evaluate(commonCode);
  fields = evaluate(fieldCode);
  const Editor = evaluate(editorCode).default;
  const writes: Record<string, any>[] = [];
  let failNext = false;
  const props = {
    data: { me: { role: 'admin' }, assets: [] }, selected: null, setSelected() {},
    modal: { kind: 'user', token: 'first-user-form', ...(user ? { user } : {}) },
    setModal() {}, open() {}, busy: false, error: '', historyRevision: 0,
    onPhotoChanged: async () => {},
    setError(message: string) { props.error = message; },
    async write(body: Record<string, any>) {
      writes.push(body);
      if (failNext) { failNext = false; throw new Error('Synthetic save failure'); }
      return { ok: true };
    },
  };
  let elements: Element[] = [], form: Element, formKey: unknown;
  const controls = new Map<string, Control>();
  const render = () => {
    cursor = 0;
    effects = [];
    const tree = Editor(props);
    elements = [];
    const walk = (value: any) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(walk); return; }
      elements.push(value);
      walk(value.props?.children);
    };
    walk(tree);
    form = elements.find(element => element.type === 'form')!;
    assert.ok(form, 'The user dialog must expose its form');
    if (form.key !== formKey) { controls.clear(); formKey = form.key; }
    for (const element of elements.filter(element => ['Input', 'Select', 'Checkbox'].includes(String(element.type)) && element.props.name)) {
      const previous = controls.get(element.props.name);
      controls.set(element.props.name, {
        element,
        value: String(element.props.value ?? previous?.value ?? element.props.defaultValue ?? ''),
        checked: Boolean(element.props.checked ?? previous?.checked ?? element.props.defaultChecked ?? false),
      });
    }
    effects.forEach(effect => effect());
  };
  render();
  render();
  const named = (name: string) => {
    const control = controls.get(name);
    assert.ok(control, `Missing control ${name}`);
    return control;
  };
  return {
    named, render, writes, props,
    fill(name: string, value: string) {
      const control = named(name);
      assert.equal(!!control.element.props.readOnly, false, `${name} must be editable`);
      control.value = value;
      control.element.props.onChange?.({ target: { value } });
      render();
    },
    chooseRole(value: string) {
      const control = named('role');
      assert.ok(Object.hasOwn(domain.roles, value));
      control.value = value;
      control.element.props.onValueChange?.(value);
      render();
    },
    failNextWrite() { failNext = true; },
    async submit() {
      await form.props.onSubmit({ preventDefault() {}, currentTarget: { controls } });
      render();
    },
    text: () => elements.flatMap(element => Array.isArray(element.props.children) ? element.props.children : [element.props.children])
      .filter(value => typeof value === 'string').join(' '),
  };
}

const existingUser = { id: 'synthetic-user', name: 'Synthetic User', email: 'user@example.test', role: 'dean', active: 1 };

test('new user dialog opens without a user record and submits its editable defaults', async () => {
  const form = mount();
  assert.equal(form.named('name').value, '');
  assert.equal(form.named('email').value, '');
  assert.equal(form.named('email').element.props.readOnly, false);
  assert.equal(form.named('role').value, 'staff');
  assert.equal(form.named('active').checked, true);
  form.fill('name', 'New Synthetic User');
  form.fill('email', 'new@example.test');
  form.fill('password', 'Synthetic-Password!');
  await form.submit();
  assert.deepEqual({ ...form.writes[0] }, {
    action: 'user', name: 'New Synthetic User', email: 'new@example.test',
    role: 'staff', active: true, password: 'Synthetic-Password!',
  });
});

test('editing a suspended user preserves inactive status and an empty password is omitted', async () => {
  for (const active of [0, 1]) {
    const form = mount({ ...existingUser, active });
    assert.equal(form.named('active').checked, Boolean(active));
    assert.equal(form.named('email').element.props.readOnly, true);
    assert.equal(form.named('password').value, '');
    await form.submit();
    assert.equal(form.writes[0].active, Boolean(active));
    assert.equal(form.writes[0].email, existingUser.email);
    assert.equal(Object.hasOwn(form.writes[0], 'password'), false);
  }
});

test('selected user role survives parent renders and a failed save, while a new form resets it', async () => {
  const form = mount(existingUser);
  assert.equal(form.named('role').value, 'dean');
  form.chooseRole('head');
  assert.equal(form.named('role').value, 'head');
  form.props.busy = true;
  form.render();
  assert.equal(form.named('role').value, 'head');
  form.props.busy = false;
  form.failNextWrite();
  await form.submit();
  assert.equal(form.props.error, 'Synthetic save failure');
  assert.equal(form.named('role').value, 'head');
  await form.submit();
  assert.deepEqual(form.writes.map(write => write.role), ['head', 'head']);
  form.props.modal = { kind: 'user', token: 'another-user-form', user: { ...existingUser, role: 'deputy' } };
  form.render();
  assert.equal(form.named('role').value, 'deputy');
});

test('password guidance and native constraints agree for new, existing and invited accounts', () => {
  for (const user of [undefined, existingUser, { ...existingUser, invited: true }]) {
    const form = mount(user);
    const password = form.named('password').element.props;
    const creating = !user || 'invited' in user;
    assert.equal(password.type, 'password');
    assert.equal(password.required, creating);
    assert.equal(password.minLength, 12);
    assert.equal(password.maxLength, 128);
    assert.equal(password.autoComplete, 'new-password');
    assert.match(form.text(), /12–128/);
    assert.doesNotMatch(form.text(), /อย่างน้อย 8/);
    assert.equal(form.named('email').element.props.readOnly, !creating);
  }
});
