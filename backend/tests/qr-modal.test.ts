import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

type Node = { type: string; props: Record<string, any> };
type Effect = { deps: unknown[]; cleanup?: () => void };
type QrAsset = { id: string; code: string; name: string; quantity: number };

// Run the actual component and its effects with a deferred QR encoder. This
// covers label selection/printing without a DOM or a browser print dialog.
function renderModal(toDataURL: (url: string) => Promise<string>) {
  const source = readFileSync(new URL('../../frontend/features/inventory/qr-label-modal.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const states: any[] = [];
  const effects: Effect[] = [];
  const errors: string[] = [];
  let stateIndex = 0;
  let effectIndex = 0;
  let pendingEffects: (() => void)[] = [];
  let prints = 0;
  const jsx = (type: string, props: Record<string, any>): Node => ({ type, props });
  const mocks: Record<string, unknown> = {
    react: {
      useState(initial: unknown) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], (value: unknown) => {
          states[index] = typeof value === 'function' ? value(states[index]) : value;
        }];
      },
      useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
        const index = effectIndex++;
        const previous = effects[index];
        if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
          pendingEffects.push(() => {
            previous?.cleanup?.();
            effects[index] = { deps, cleanup: effect() };
          });
        }
      }
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-dom': { createPortal: (children: Node) => jsx('portal', { children }) },
    'lucide-react': { Printer: 'Printer' },
    '@/components/ui/button': { Button: 'Button' },
    '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription'].map(name => [name, name])),
    '@/components/ui/skeleton': { Skeleton: 'Skeleton' },
    sonner: { toast: { error: (message: string) => errors.push(message) } },
    qrcode: { toDataURL }
  };
  const module = { exports: {} as { default: (props: unknown) => Node } };
  runInNewContext(code, {
    module,
    exports: module.exports,
    require(name: string) {
      assert.ok(name in mocks, `Unexpected component import: ${name}`);
      return mocks[name];
    },
    location: { origin: 'https://assets.example.test' },
    window: { print: () => prints++ },
    document: { body: {} }
  });
  return {
    errors,
    get prints() { return prints; },
    render(open: boolean, assets: QrAsset[]) {
      stateIndex = 0;
      effectIndex = 0;
      pendingEffects = [];
      const tree = module.exports.default({ open, assets, onClose() {} });
      // Return the rendered output before effects so stale labels cannot escape
      // for one render between a new selection and its generation effect.
      pendingEffects.forEach(effect => effect());
      return tree;
    }
  };
}

function nodes(tree: unknown, type: string): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, type));
  if (!tree || typeof tree !== 'object') return [];
  const node = tree as Node;
  return [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type)];
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
const asset = (id: string): QrAsset => ({ id, code: id, name: 'รายการ ' + id, quantity: 1 });

test('QR clears previous labels and printing when reopened with no eligible assets', async () => {
  const modal = renderModal(async url => 'data:' + url);
  const assets = [asset('active-1')];
  modal.render(true, assets);
  await settle();
  let tree = modal.render(true, assets);
  const print = nodes(tree, 'Button')[0];
  assert.equal(print.props.disabled, false);
  print.props.onClick();
  assert.equal(modal.prints, 1);
  assert.equal(nodes(tree, 'portal').length, 1);

  modal.render(false, assets);
  const empty: QrAsset[] = [];
  tree = modal.render(true, empty);
  assert.equal(nodes(tree, 'img').length, 0);
  assert.equal(nodes(tree, 'portal').length, 0);
  assert.equal(nodes(tree, 'Button')[0].props.disabled, true);
  assert.equal(nodes(tree, 'Skeleton').length, 0);
});

test('QR selection changes never display or print the previous selection', async () => {
  const modal = renderModal(async url => 'data:' + url);
  const first = [asset('first')];
  const second = [asset('second')];
  modal.render(true, first);
  await settle();
  assert.equal(nodes(modal.render(true, first), 'Button')[0].props.disabled, false);

  const pending = modal.render(true, second);
  assert.equal(nodes(pending, 'img').length, 0);
  assert.equal(nodes(pending, 'portal').length, 0);
  assert.equal(nodes(pending, 'Button')[0].props.disabled, true);
  await settle();
  const ready = modal.render(true, second);
  assert.ok(nodes(ready, 'img').every(image => image.props.alt === 'QR second'));
  assert.equal(nodes(ready, 'Button')[0].props.disabled, false);
});

test('unfinished QR generation cannot restore labels or errors after close', async () => {
  let rejectQr!: (error: Error) => void;
  const modal = renderModal(() => new Promise((_resolve, reject) => { rejectQr = reject; }));
  const assets = [asset('pending')];
  modal.render(true, assets);
  await settle();
  modal.render(false, assets);
  rejectQr(new Error('encoder failure'));
  await settle();
  const tree = modal.render(true, []);
  assert.equal(nodes(tree, 'portal').length, 0);
  assert.equal(nodes(tree, 'Button')[0].props.disabled, true);
  assert.equal(nodes(tree, 'Skeleton').length, 0);
  assert.deepEqual(modal.errors, []);
});
