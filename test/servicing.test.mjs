import assert from 'node:assert/strict';
import test from 'node:test';
import {cents,servicingInput} from '../lib/servicing.mjs';

test('servicing converts CAD to exact cents and rejects out-of-range and ambiguous inputs', () => {
  assert.equal(cents('145.07'),14507);
  assert.equal(cents('2.1'),210);
  assert.equal(cents('1000000000'),100000000000);
  for (const value of ['1.001','-1','1e3','1000000000.01','',1.1]) assert.throws(() => cents(value));
});

test('repayment commands validate allocations, references, dates and reversal reasons', () => {
  const input = {action:'book-receipt',date:'2028-02-29',reference:' Bank-100 ',period:'3',principal:'100',interest:'0.50'};
  assert.deepEqual(servicingInput(input),{date:'2028-02-29',ref:'bank-100',period:3,principal:10000,interest:50});
  assert.throws(() => servicingInput({...input,period:'121'}));
  assert.throws(() => servicingInput({...input,date:'2027-02-29'}));
  assert.throws(() => servicingInput({...input,reference:'a\nb'}));
  assert.throws(() => servicingInput({...input,principal:'0',interest:'0'}));
  assert.throws(() => servicingInput({...input,action:'match-receipt',amount:'0'}));
  assert.throws(() => servicingInput({action:'reverse-receipt',reason:'No'}));
});
