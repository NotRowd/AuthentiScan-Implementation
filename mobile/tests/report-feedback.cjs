const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const filename = path.join(__dirname, '../components/ui/ExportReportButton.tsx');
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
}}).outputText;
function mount(share) {
  const hooks = [], alerts = [], timers = new Map(); let cursor = 0, cleanup, focused = false, timerId = 0;
  const module = { exports: {} };
  vm.runInNewContext(code, {module, exports: module.exports, AbortController,
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    require(name) {
      if (name === 'react') return { useRef: value => { const i = cursor++; return hooks[i] ??= {current:value}; },
        useState: value => { const i = cursor++; if (!(i in hooks)) hooks[i] = value; return [hooks[i], next => hooks[i] = next]; }, useCallback: fn => fn };
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'react-native') return {View:'View', Alert:{alert:(...args) => alerts.push(args)}};
      if (name === 'expo-router') return {useFocusEffect: fn => {if (!focused) {focused = true; cleanup = fn();}}};
      if (name.includes('reportExport')) return {shareSavedScanReport:share};
      if (name.includes('Colors')) return {authentic:'green', fake:'red', bgSecondary:'black'};
      return name;
    },
  }, {filename});
  const render = () => {cursor = 0; return module.exports.default({scanId:'21'});};
  return { render, alerts, blur:()=>cleanup(), flush:()=>{for (const fn of timers.values()) fn(); timers.clear();} };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [].concat(node.props?.children || [])) {const found = find(child, predicate); if (found) return found;}
}
const button = tree => find(tree, n => n.type === './CyberButton');
const text = (tree, value) => find(tree, n => n.props?.children === value);
(async()=>{
  // Native share resolves on both completed and cancelled sheets. Neither
  // outcome may be presented as a confirmed save.
  const completed = mount(async()=>{});
  await button(completed.render()).props.onPress(); completed.flush();
  assert.equal(completed.alerts[0][0], 'PDF prepared successfully');
  assert.match(completed.alerts[0][1], /If you cancelled, it was not saved/);
  assert.ok(text(completed.render(), 'PDF prepared successfully'));
  assert.equal(button(completed.render()).props.disabled, false);
  const failed = mount(async()=>{throw 'storage failure';});
  await button(failed.render()).props.onPress(); failed.flush();
  assert.equal(failed.alerts[0][0], 'PDF export failed');
  assert.ok(text(failed.render(), 'PDF export failed'));
  let resolve; const pending = mount(()=>new Promise(r=>resolve=r));
  const work = button(pending.render()).props.onPress(); pending.blur(); resolve(); await work; pending.flush();
  assert.equal(pending.alerts.length, 0, 'Do not alert on another screen after leaving mid-export');
  const dismissed = mount(async()=>{});
  await button(dismissed.render()).props.onPress(); dismissed.blur(); dismissed.flush();
  assert.equal(dismissed.alerts.length, 0, 'Cancel queued popup when leaving during dismissal delay');
  console.log('PASS: prepared popup and persistent status; honest cancellation wording; failure popup/status; no late popup after navigation; retry unlocked. UI/native APIs mocked.');
})().catch(error=>{console.error(error);process.exitCode=1});
