// Exercise the actual layout JSX with platform UI stubs, plus Expo's stack
// state reducer. Native iPhone edge-swipe behavior still needs a device check.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { StackRouter } = require('../node_modules/expo-router/build/react-navigation/routers/StackRouter');
let auth = { isLoading: false, isAuthenticated: false };
const Stack = Object.assign(function Stack() {}, { Screen: function Screen() {}, Protected: function Protected() {} });
const Redirect = function Redirect() {};
function load(relative) {
  const filename = path.join(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === 'expo-router') return { Stack, Redirect };
    if (name === 'react-native') return { View: 'View', Text: 'Text', ActivityIndicator: 'Loading', StyleSheet: { create: x => x }, Dimensions: { get: () => ({ width: 390, height: 844 }) } };
    if (name.includes('AuthContext')) return { AuthProvider: 'AuthProvider', useAuthContext: () => auth };
    if (name.includes('useAuth')) return { useAuth: () => auth };
    return {};
  }}, { filename });
  return module.exports.default;
}
const Root = load('app/_layout.tsx');
const Home = load('app/(public)/home.tsx');
function find(node, match) {
  if (!node) return;
  if (match(node)) return node;
  for (const child of [].concat(node.props?.children || [])) { const result = find(child, match); if (result) return result; }
}
function navigation() { return find(Root(), n => n.type?.name === 'Navigation').type(); }
function screens(node) {
  if (!node || node.type === Stack.Protected && !node.props.guard) return [];
  if (node.type === Stack.Screen) return [node.props];
  return [].concat(node.props?.children || []).flatMap(screens);
}
auth = { isLoading: true, isAuthenticated: false };
assert.equal(find(navigation(), n => n.type === Stack), undefined);
auth = { isLoading: false, isAuthenticated: false };
const guestNames = screens(navigation()).map(s => s.name);
assert.ok(guestNames.includes('(auth)')); assert.ok(guestNames.includes('index')); assert.ok(!guestNames.includes('(tabs)'));
auth = { isLoading: false, isAuthenticated: true };
const signedScreens = screens(navigation()), signedNames = signedScreens.map(s => s.name);
assert.ok(!signedNames.includes('(auth)')); assert.ok(!signedNames.includes('index'));
assert.equal(signedScreens.find(s => s.name === '(tabs)').options.gestureEnabled, false);
assert.ok(signedNames.includes('(public)'), 'Shared pricing/info pages remain available');
assert.notEqual(signedScreens.find(s => s.name === 'result').options?.gestureEnabled, false);
assert.notEqual(signedScreens.find(s => s.name === 'edit-profile').options?.gestureEnabled, false);
assert.equal(Home().type, Redirect); assert.equal(Home().props.href, '/(tabs)/dashboard');
const router = StackRouter({});
const initial = router.getInitialState({ routeNames: guestNames, routeParamList: {}, routeGetIdList: {} });
const before = { ...initial, index: 2, routes: [
  { key: 'public-before-login', name: '(public)' },
  { key: 'old-login', name: '(auth)' },
  { key: 'dashboard', name: '(tabs)' },
] };
const after = router.getStateForRouteNamesChange(before, { routeNames: signedNames, routeParamList: {}, routeKeyChanges: [] });
assert.ok(after.routes.every(r => r.name !== '(auth)' && r.name !== 'index'));
const loggedOut = router.getStateForRouteNamesChange(after, { routeNames: guestNames, routeParamList: {}, routeKeyChanges: [] });
assert.ok(loggedOut.routes.every(r => !['(tabs)', 'result', 'feedback', 'edit-profile'].includes(r.name)));
auth = { isLoading: false, isAuthenticated: false };
assert.notEqual(Home().type, Redirect, 'Explicit logout restores guest Home');
console.log('PASS: session-loading gate; guest/authenticated route guards; stale login history removal; tab-shell swipe disabled; detail gestures preserved; signed-in Home redirect; explicit logout removes private routes. Native iPhone gesture test pending.');
