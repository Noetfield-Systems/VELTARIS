import assert from 'node:assert/strict';
import test from 'node:test';
import worker,{check,snapshot} from '../infrastructure/cloudflare/worker.mjs';

test('readiness handles absent, healthy, failed and stale receipts', () => {
  const receipt={id:'release:1',checked_at:5000,source:'release',application:1,pilot:1,duration_ms:21};
  assert.equal(snapshot(null).status,'awaiting_check');
  assert.equal(snapshot(receipt,5000).status,'operational');
  assert.equal(snapshot({...receipt,pilot:0},5000).status,'degraded');
  assert.equal(snapshot(receipt,5000+16*60000).status,'stale');
});

test('check requests fixed VELTARIS routes and writes counters without payloads', async () => {
  const calls=[], binds=[];
  const db={
    prepare(sql){return {bind(...args){binds.push({sql,args});return this;},first(){return {id:'release:1'};}};},
    async batch(statements){assert.equal(statements.length,2);},
  };
  const fake=async (url,options) => {
    calls.push(url);
    assert.equal(options.redirect,'error');
    return Response.json(url.endsWith('/pilot')?{available:false,secret:'ignored'}:{status:'ok',service:'veltaris-capital'});
  };
  assert.deepEqual(await check(db,'release','release:1',fake,()=>100),{id:'release:1'});
  assert.deepEqual(calls,['https://veltaris-capital.vercel.app/api/health','https://veltaris-capital.vercel.app/api/pilot']);
  assert.deepEqual(binds[0].args,['release:1',100,'release',1,0,0]);
});

test('the public Worker offers discovery but blocks untrusted release probes',async ()=>{
  const origin='https://example.test';
  const info=await worker.fetch(new Request(origin+'/.well-known/uhail.json'),{});
  assert.equal((await info.json()).openapi,origin+'/openapi.json');
  assert.equal((await worker.fetch(new Request(origin+'/_ops/check',{method:'POST'}),{})).status,401);
  assert.equal((await worker.fetch(new Request(origin+'/v1/status',{method:'POST'}),{})).status,405);
});
