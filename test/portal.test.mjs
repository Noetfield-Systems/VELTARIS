import assert from 'node:assert/strict';
import test from 'node:test';
import {COOKIE,cookie,digest,documentPayload,MAX_FILE_SIZE,parseDate,sessionKey,token} from '../lib/portal.mjs';
import handler from '../api/portal.mjs';

test('workspace cookies are opaque, scoped, and converted to server-side digests', () => {
  const secret = token();
  assert.equal(secret.length,43);
  assert.equal(sessionKey('other=ignored; '+COOKIE+'='+secret),digest(secret));
  assert.equal(sessionKey(COOKIE+'=short'),null);
  assert.match(cookie(secret),/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200$/);
  assert.match(cookie('',0),/Max-Age=0$/);
});

test('document intake accepts canonical PDF and text data up to the configured limit', () => {
  const from = (data) => Buffer.from(data).toString('base64');
  assert.equal(documentPayload({name:'loan.pdf',data:from('%PDF-1.7')}).media,'application/pdf');
  assert.equal(documentPayload({name:'loan.csv',data:from('day,amount\n1,10')}).media,'text/csv');
  for (const candidate of [
    {name:'invoice.pdf',data:from('not pdf')},
    {name:'test.csv',data:from([0xC3,0x28])},
    {name:'file.html',data:from('safe text')},
    {name:'../../loan.txt',data:from('file')},
    {name:'file.txt',data:'YWJj='},
    {name:'oversize.txt',data:Buffer.alloc(MAX_FILE_SIZE + 1,65).toString('base64')},
  ]) assert.throws(() => documentPayload(candidate));
});

test('follow-up date parsing rejects invalid and normalized calendars', () => {
  assert.equal(parseDate(''),null);
  assert.equal(parseDate('2028-02-29'),'2028-02-29');
  assert.throws(() => parseDate('2027-02-29'));
});

async function call(method, headers, body, url='/api/portal') {
  const result = {};
  const response = {setHeader(){},status(code){result.status=code;return this;},json(data){result.data=data;return this;}};
  await handler({method,headers,body,url},response);
  return result;
}

test('portal blocks anonymous data access, cross-origin writes and invalid activation', async () => {
  assert.equal((await call('GET',{})).status,401);
  assert.equal((await call('GET',{},undefined,'/api/portal?document=01234567-0123-4012-a011-23456789ab01')).status,401);
  assert.equal((await call('POST',{'content-type':'application/json','origin':'https://example.test'},{action:'activate'})).status,403);
  assert.equal((await call('POST',{'content-type':'application/json'},{action:'activate',invitation:'short'})).status,400);
  assert.equal((await call('POST',{'content-type':'application/json'},{action:'facility'})).status,401);
});
