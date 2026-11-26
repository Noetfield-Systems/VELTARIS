import assert from 'node:assert/strict';

const base = process.env.VELTARIS_BASE_URL || 'https://veltaris-capital.vercel.app';
const routes = [
  ['/', /VELTARIS Capital/],
  ['/workspace.html', /Credit workspace/],
  ['/lab.html', /Capital Lab/],
  ['/developer.html', /Issuance API/],
  ['/v1/openapi.json', /simulateIssuance/],
  ['/api/health', /"service":"veltaris-capital"/],
];
const results = await Promise.all(routes.map(async ([route, expected]) => {
  const response = await fetch(new URL(route, base), {signal: AbortSignal.timeout(20000)});
  assert.equal(response.status, 200, route);
  assert.match(await response.text(), expected, route);
  return route + ' HTTP 200';
}));
for (const result of results) console.log(result);

const pilot = await fetch(new URL('/api/pilot', base), {signal: AbortSignal.timeout(20000)});
assert.equal(pilot.status, 200);
const status = await pilot.json();
assert.equal(status.available, true, 'Dedicated pilot storage is unavailable');
console.log('Pilot storage reachable:', status.available);
