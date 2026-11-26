import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/pilot.mjs';
import {pilotFields} from '../lib/pilot.mjs';

const valid = {
  name: ' Example User ', email: 'USER@example.test', company: 'Example Inc',
  workflow: 'reporting', context: '', requestId: '498739e2-54d6-4c6a-960c-874db76b460d',
};

test('normalizes only the allowed lead fields', () => {
  const fields = pilotFields({...valid, privateNote: 'discard'});
  assert.equal(fields.email, 'user@example.test');
  assert.equal(fields.name, 'Example User');
  assert.ok(!Object.hasOwn(fields, 'privateNote'));
});

test('rejects spam trap, invalid email, unrecognized workflow, and invalid request ID', () => {
  for (const invalid of [{website: 'https://example.test'}, {email: 'a@b'}, {workflow: 'other'}, {requestId: 'anything'}, {context: 'x'.repeat(601)}]) {
    assert.equal(pilotFields({...valid, ...invalid}), null);
  }
});

async function call(method, body, headers = {'content-type': 'application/json'}) {
  const result = {};
  const response = {
    setHeader() {},
    status(code) { result.code = code; return this; },
    json(payload) { result.body = payload; return this; },
  };
  await handler({method, headers, body}, response);
  return result;
}

test('API reports invalid requests and declines to fabricate a successful receipt', async () => {
  const original = process.env.DATABASE_URL;
  const veltaris = process.env.VELTARIS_DATABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.VELTARIS_DATABASE_URL;
  try {
    assert.deepEqual(await call('GET'), {code: 200, body: {available: false}});
    assert.equal((await call('POST', valid)).code, 503);
    assert.equal((await call('POST', {name: 'x'})).code, 400);
    assert.equal((await call('POST', valid, {'content-type': 'text/plain'})).code, 415);
    assert.equal((await call('POST', valid, {'sec-fetch-site': 'cross-site'})).code, 403);
    assert.equal((await call('PUT', valid)).code, 405);
  } finally {
    if (original !== undefined) process.env.DATABASE_URL = original;
    if (veltaris !== undefined) process.env.VELTARIS_DATABASE_URL = veltaris;
  }
});

test('pilot intake records bounded campaign tags and ignores unsupported values', () => {
  const result = pilotFields({
    name: 'Release QA', email: 'qa@example.test', company: 'Synthetic',
    workflow: 'reporting', requestId: '28142ada-2397-446c-a763-6180c898bf68',
    utm_source: 'linkedin', utm_medium: 'paid-social', utm_campaign: 'credit_launch',
    utm_content: 'not an allowed tag@example.test', entry_page: '/private-credit.html',
  });
  assert.ok(result);
  assert.equal(result.utm_source, 'linkedin');
  assert.equal(result.utm_medium, 'paid-social');
  assert.equal(result.utm_campaign, 'credit_launch');
  assert.equal(result.utm_content, null);
  assert.equal(result.entry_page, '/private-credit.html');
});
