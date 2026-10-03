import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireLocalEnvironment,localEnvironment,HOSTS} from '../local-config.mjs';
import {dayWindow} from '../server/allowance.mjs';
test('local environment rejects production projects, credentials, and missing emulator hosts',()=>{
  const safe=localEnvironment({});
  assert.doesNotThrow(()=>requireLocalEnvironment(safe));
  assert.throws(()=>requireLocalEnvironment({...safe,GCLOUD_PROJECT:'authentiscan-bc704'}));
  assert.throws(()=>localEnvironment({GOOGLE_APPLICATION_CREDENTIALS:'private.json'}));
  assert.throws(()=>localEnvironment({GCLOUD_PROJECT:'authentiscan-bc704'}));
  assert.throws(()=>localEnvironment({FIREBASE_CONFIG:'{}'}));
  assert.doesNotThrow(()=>requireLocalEnvironment({...safe,FIREBASE_CONFIG:JSON.stringify({projectId:'demo-authentiscan-local',storageBucket:'demo-authentiscan-local.appspot.com',databaseURL:'https://demo-authentiscan-local.firebaseio.com'})}));
  assert.throws(()=>requireLocalEnvironment({...safe,FIREBASE_CONFIG:JSON.stringify({projectId:'authentiscan-bc704'})}));
  for(const key of Object.keys(HOSTS))assert.throws(()=>requireLocalEnvironment({...safe,[key]:''}));
  assert.throws(()=>localEnvironment({FIRESTORE_EMULATOR_HOST:'example.com:8080'}));
});
test('Manila daily reset occurs at 16:00 UTC without browser timezone dependence',()=>{
  const before=dayWindow(Date.parse('2026-09-21T15:59:59Z'));
  const after=dayWindow(Date.parse('2026-09-21T16:00:00Z'));
  assert.equal(before.key,'2026-09-21');assert.equal(after.key,'2026-09-22');
  assert.equal(before.end,after.start);assert.equal(after.end-after.start,86400000);
  assert.throws(()=>dayWindow(NaN));
});
