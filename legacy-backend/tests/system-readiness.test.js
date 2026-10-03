const test = require('node:test');
const assert = require('node:assert/strict');
const { checkAiReadiness } = require('../src/services/systemReadiness');

test('readiness requires a configured AI service and loaded model', async () => {
  assert.equal(await checkAiReadiness(() => { throw Error('must not fetch'); }, ''), 'not_ready');
  for (const [payload, expected] of [
    [{success:true,model_loaded:true}, 'ready'],
    [{success:true,model_loaded:false}, 'not_ready'],
    [{success:false,model_loaded:true}, 'not_ready'],
    [{success:true,model_loaded:'true'}, 'not_ready'],
    [{}, 'not_ready'],
  ]) {
    const status = await checkAiReadiness(async (url, options) => {
      assert.equal(url, 'http://example.test/health');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, undefined);
      return {ok:true,json:async()=>payload};
    }, ' http://example.test/ ');
    assert.equal(status, expected);
  }
});
test('readiness handles failed HTTP, malformed JSON, and unreachable AI', async () => {
  for (const mock of [async()=>({ok:false}), async()=>({ok:true,json:async()=>{throw Error('bad json');}}), async()=>{throw Error('private server detail');}]) {
    assert.equal(await checkAiReadiness(mock, 'http://example.test'), 'unavailable');
  }
});
test('readiness aborts a stalled AI request', async () => {
  const status=await checkAiReadiness((url,{signal})=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});
  }), 'http://example.test', 10);
  assert.equal(status,'unavailable');
});
test('HTTP readiness requires auth and reports degradation without exposing configuration', async () => {
  process.env.JWT_SECRET='readiness-test-only';
  process.env.NODE_ENV='test';
  process.env.AI_SERVICE_URL='http://private-ai.example.test';
  const previousFetch=global.fetch;
  global.fetch=async()=>({ok:true,json:async()=>({success:true,model_loaded:false})});
  const app=require('../src/app');
  const jwt=require('jsonwebtoken');
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try {
    const url=`http://127.0.0.1:${server.address().port}/api/v1/system/health`;
    assert.equal((await previousFetch(url)).status,401);
    const response=await previousFetch(url,{headers:{Authorization:'Bearer '+jwt.sign({userId:1},process.env.JWT_SECRET)}});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const payload=await response.json();
    assert.equal(payload.data.backend,'online');
    assert.equal(payload.data.ai,'not_ready');
    assert.ok(!Number.isNaN(Date.parse(payload.data.checked_at)));
    assert.ok(!JSON.stringify(payload).includes('private-ai'));
  } finally {
    global.fetch=previousFetch;
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
    await require('../src/config/db').pool.end();
  }
});
