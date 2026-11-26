import assert from 'node:assert/strict';
import test from 'node:test';
import {csv, facilityFromInput, paymentSchedule, SAMPLE} from '../public/credit.mjs';

const valid = {borrower: 'Example Funding', asset: 'Equipment', stage: 'Review', principal: '100.01', rate: '7.50', term: '2', start: '2028-01-31'};

test('converts currency to cents and rate to basis points', () => {
  const facility = facilityFromInput(valid);
  assert.equal(facility.principal, 10001);
  assert.equal(facility.bps, 750);
});

test('rejects fractional cents, invalid dates, and unsupported terms', () => {
  for (const invalid of [{principal: '1.001'}, {start: '2027-02-29'}, {term: 121}, {rate: '30.01'}, {principal: 'Infinity'}, {borrower: ' '}]) {
    assert.throws(() => facilityFromInput({...valid, ...invalid}));
  }
});

test('clamps month ends and restores the original day where possible', () => {
  const payments = paymentSchedule(facilityFromInput(valid));
  assert.deepEqual(payments.map((item) => item.date), ['2028-02-29', '2028-03-31']);
  assert.deepEqual(payments.map((item) => item.principal), [0, 10001]);
  assert.deepEqual(payments.map((item) => item.interest), [63, 63]);
});

test('sample totals and principal projection reconcile', () => {
  assert.equal(SAMPLE.reduce((total, item) => total + item.principal, 0), 920000000);
  const payments = SAMPLE.flatMap(paymentSchedule);
  assert.equal(payments.reduce((total, item) => total + item.interest, 0), 78309996);
  assert.equal(payments.reduce((total, item) => total + item.principal, 0), 920000000);
  assert.ok(payments.every((item) => item.total === item.interest + item.principal));
});

test('CSV quotes fields and neutralizes leading spreadsheet formulas', () => {
  assert.equal(csv([['Client "A"', ' =SUM(3,4)', 12]]), '"Client ""A""","\' =SUM(3,4)","12"\r\n');
});
