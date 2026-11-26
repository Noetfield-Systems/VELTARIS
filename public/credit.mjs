export const STAGES = ['Intake', 'Review', 'Active', 'Matured'];
export const ASSETS = ['Equipment', 'Receivables', 'Working capital', 'Real estate', 'Other'];

export const SAMPLE = [
  {id: 'VC-1001', borrower: 'Northshore Equipment Pool', asset: 'Equipment', stage: 'Active', principal: 240000000, bps: 750, term: 12, start: '2027-01-31'},
  {id: 'VC-1002', borrower: 'Cedar Receivables Fund', asset: 'Receivables', stage: 'Review', principal: 375000000, bps: 860, term: 12, start: '2027-01-15'},
  {id: 'VC-1003', borrower: 'Pacific Working Capital', asset: 'Working capital', stage: 'Intake', principal: 305000000, bps: 920, term: 12, start: '2027-02-15'},
];

function scaledInteger(value, decimals) {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!match) return NaN;
  return Number(match[1]) * 10 ** decimals + Number((match[2] || '').padEnd(decimals, '0'));
}

export function facilityFromInput(data) {
  const borrower = String(data.borrower || '').trim();
  const principal = scaledInteger(data.principal, 2);
  const bps = scaledInteger(data.rate, 2);
  const term = Number(data.term);
  const start = String(data.start || '');
  const date = new Date(start + 'T00:00:00Z');
  const validDate = /^20\d{2}-\d{2}-\d{2}$/.test(start)
    && Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === start;

  if (!borrower || borrower.length > 100 || !ASSETS.includes(data.asset)
    || !STAGES.includes(data.stage) || !Number.isSafeInteger(principal)
    || principal < 100 || principal > 100000000000 || !Number.isInteger(bps)
    || bps < 0 || bps > 3000 || !Number.isInteger(term) || term < 1 || term > 120 || !validDate) {
    throw new Error('Enter a valid facility. Principal must be CAD 1–1,000,000,000, the rate 0–30%, and the term 1–120 months.');
  }

  return {borrower, asset: data.asset, stage: data.stage, principal, bps, term, start};
}

export function paymentSchedule(facility) {
  const [year, month, day] = facility.start.split('-').map(Number);
  const interest = Math.round(facility.principal * facility.bps / 120000);
  return Array.from({length: facility.term}, (_, index) => {
    const period = index + 1;
    const lastDay = new Date(Date.UTC(year, month + period, 0)).getUTCDate();
    const due = new Date(Date.UTC(year, month + period - 1, Math.min(day, lastDay)));
    const principal = period === facility.term ? facility.principal : 0;
    return {period, date: due.toISOString().slice(0, 10), interest, principal, total: interest + principal};
  });
}

export function csv(rows) {
  return rows.map((row) => row.map((value) => {
    const text = String(value);
    const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n') + '\r\n';
}
