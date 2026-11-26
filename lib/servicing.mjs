import {parseDate,requiredText} from './portal.mjs';

export function cents(value) {
  if (typeof value !== 'string') throw new Error('Enter a CAD amount with up to two decimal places.');
  const parts = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!parts) throw new Error('Enter a CAD amount with up to two decimal places.');
  const amount = Number(parts[1])*100 + Number((parts[2] || '').padEnd(2,'0'));
  if (amount > 100000000000) throw new Error('The maximum amount is CAD 1 billion.');
  return amount;
}

const reference = (value) => {
  const text = requiredText(value,80,'Reference');
  if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error('Enter a single-line reference.');
  return text.toLowerCase();
};

export function servicingInput(body) {
  if (body.action === 'reverse-receipt') {
    const reason = requiredText(body.reason,300,'Reversal reason');
    if (reason.length < 4) throw new Error('Explain why the entry is being reversed.');
    return {reason};
  }
  const date = parseDate(body.date);
  if (!date) throw new Error('Enter the transaction date.');
  const ref = reference(body.reference);
  if (body.action === 'match-receipt') {
    const amount = cents(body.amount);
    if (!amount) throw new Error('Enter a positive statement amount.');
    return {date,ref,amount};
  }
  const period = Number(body.period);
  if (!Number.isInteger(period) || period < 1 || period > 120) throw new Error('Enter a valid payment period.');
  const principal = cents(body.principal);
  const interest = cents(body.interest);
  if (principal+interest < 1 || principal+interest > 100000000000) throw new Error('Enter a positive repayment up to CAD 1 billion.');
  return {date,ref,period,principal,interest};
}
