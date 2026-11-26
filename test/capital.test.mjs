import assert from 'node:assert/strict';
import test from 'node:test';
import {economics, ownership, simulateIssuance} from '../public/capital.mjs';

const scenario = {principalCents: 10000000, unitPriceCents: 10000, holdingUnits: 200,
  requestedUnits: 75, senderVerified: true, recipientVerified: true, paused: false};

test('venture model reproduces the founder baseline and supports zero revenue', () => {
  const inputs = {customers: 40, contract: 50000, serviced: 100000000, fee: .3, margin: 75, opex: 1200000, multiple: 10};
  const result = economics(inputs);
  assert.equal(result.revenue, 2300000);
  assert.equal(result.operatingIncome, 525000);
  assert.equal(result.valuation, 23000000);
  assert.equal(result.operatingMargin.toFixed(1), '22.8');
  assert.equal(economics({...inputs, customers: 0, serviced: 0}).operatingMargin, null);
});

test('founder ownership follows a pre-money pool and rejects overallocated shares', () => {
  const input = {preMoney: 5000000, investment: 1000000, cofounder: 10, pool: 10};
  const {founder, cofounder, pool, investors, postMoney} = ownership(input);
  assert.deepEqual([founder, cofounder, pool, investors].map((x) => x.toFixed(1)), ['66.7', '8.3', '8.3', '16.7']);
  assert.equal(postMoney, 6000000);
  assert.throws(() => ownership({...input, pool: 95}), /100%/);
});

test('successful issuance simulation conserves units and denominates value in cents', () => {
  const result = simulateIssuance(scenario);
  assert.equal(result.mode, 'simulation');
  assert.equal(result.issuedUnits, 1000);
  assert.equal(result.transfer.allowed, true);
  assert.equal(result.transfer.senderAfter + result.transfer.recipientAfter, scenario.holdingUnits);
  assert.equal(result.transfer.transferValueCents, 750000);
});

test('paused, ineligible and overdrawn transfers collect reasons and leave holdings intact', () => {
  const {transfer} = simulateIssuance({...scenario, paused: true, senderVerified: false, recipientVerified: false, requestedUnits: 300});
  assert.deepEqual(transfer.reasons, ['TRANSFERS_PAUSED', 'SENDER_INELIGIBLE', 'RECIPIENT_INELIGIBLE', 'INSUFFICIENT_HOLDINGS']);
  assert.equal(transfer.allowed, false);
  assert.equal(transfer.settledUnits, 0);
  assert.equal(transfer.senderAfter, 200);
});

test('issuance simulation rejects fractional supply, impossible holdings and string flags', () => {
  for (const input of [{unitPriceCents: 3}, {holdingUnits: 1001}, {recipientVerified: 'false'}, {principalCents: 0}, {requestedUnits: 0}]) {
    assert.throws(() => simulateIssuance({...scenario, ...input}));
  }
});
