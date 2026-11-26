function number(value, label, max, integer = false) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') {
    throw new Error(label + ' is required.');
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new Error(label + ' must be between 0 and ' + max.toLocaleString('en-CA') + (integer ? ' as a whole number.' : '.'));
  }
  return parsed;
}

function whole(value, label, max) {
  if (typeof value !== 'number') throw new Error(label + ' must be a whole number.');
  return number(value, label, max, true);
}

function flag(value, label) {
  if (typeof value !== 'boolean') throw new Error(label + ' must be true or false.');
  return value;
}

export function economics(input) {
  const customers = number(input.customers, 'Customers', 100000, true);
  const contract = number(input.contract, 'Annual contract value', 10000000);
  const serviced = number(input.serviced, 'Serviced assets', 100000000000);
  const fee = number(input.fee, 'Servicing fee', 100);
  const margin = number(input.margin, 'Gross margin', 100);
  const opex = number(input.opex, 'Operating expense', 100000000000);
  const multiple = number(input.multiple, 'Revenue multiple', 100);
  const software = customers * contract;
  const servicing = serviced * fee / 100;
  const revenue = software + servicing;
  const operatingIncome = revenue * margin / 100 - opex;
  return {software, servicing, revenue, operatingIncome, valuation: revenue * multiple,
    operatingMargin: revenue ? operatingIncome / revenue * 100 : null};
}

export function ownership(input) {
  const preMoney = number(input.preMoney, 'Pre-money valuation', 100000000000);
  const investment = number(input.investment, 'New investment', 100000000000);
  const cofounder = number(input.cofounder, 'Co-founder stake', 100);
  const pool = number(input.pool, 'Option pool', 100);
  if (preMoney === 0) throw new Error('Pre-money valuation must be greater than zero.');
  if (cofounder + pool > 100) throw new Error('Co-founder and option pool stakes must total 100% or less.');
  const retained = preMoney / (preMoney + investment);
  return {founder: (100 - cofounder - pool) * retained, cofounder: cofounder * retained,
    pool: pool * retained, investors: (1 - retained) * 100, postMoney: preMoney + investment};
}

export function simulateIssuance(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Provide an issuance scenario object.');
  const principalCents = whole(input.principalCents, 'Principal cents', 100000000000);
  const unitPriceCents = whole(input.unitPriceCents, 'Unit price cents', 1000000000);
  const requestedUnits = whole(input.requestedUnits, 'Requested units', 100000000000);
  const holdingUnits = whole(input.holdingUnits, 'Sender holdings', 100000000000);
  const senderVerified = flag(input.senderVerified, 'Sender eligibility');
  const recipientVerified = flag(input.recipientVerified, 'Recipient eligibility');
  const paused = flag(input.paused, 'Pause status');
  if (!principalCents || !unitPriceCents || !requestedUnits) throw new Error('Principal, unit price, and transfer units must be greater than zero.');
  if (principalCents % unitPriceCents !== 0) throw new Error('Principal must divide evenly into whole units.');
  const issuedUnits = principalCents / unitPriceCents;
  if (holdingUnits > issuedUnits) throw new Error('Sender holdings cannot exceed the proposed supply.');

  const reasons = [];
  if (paused) reasons.push('TRANSFERS_PAUSED');
  if (!senderVerified) reasons.push('SENDER_INELIGIBLE');
  if (!recipientVerified) reasons.push('RECIPIENT_INELIGIBLE');
  if (requestedUnits > holdingUnits) reasons.push('INSUFFICIENT_HOLDINGS');
  const allowed = reasons.length === 0;
  const settledUnits = allowed ? requestedUnits : 0;

  return {mode: 'simulation', currency: 'CAD', issuedUnits, principalCents, unitPriceCents, transfer: {
    allowed, reasons, requestedUnits, settledUnits, senderAfter: holdingUnits - settledUnits,
    recipientAfter: settledUnits, transferValueCents: settledUnits * unitPriceCents,
  }};
}
