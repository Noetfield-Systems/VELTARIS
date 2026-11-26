import {economics, ownership} from './capital.mjs';

const byId = (id) => document.getElementById(id);
const currency = new Intl.NumberFormat('en-CA', {style: 'currency', currency: 'CAD', maximumFractionDigits: 2});
const count = new Intl.NumberFormat('en-CA');
const percentage = (value) => value === null ? '—' : value.toFixed(1) + '%';

function connectCalculator(name, calculate, percentages) {
  const form = byId(name + '-form');
  const status = byId(name + '-status');
  const update = () => {
    try {
      const result = calculate(Object.fromEntries(new FormData(form)));
      for (const [key, value] of Object.entries(result)) {
        byId(key).textContent = percentages.includes(key) ? percentage(value) : currency.format(value);
      }
      status.textContent = '';
    } catch (error) {
      status.textContent = error.message;
    }
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    update();
  });
  update();
}

connectCalculator('economics', economics, ['operatingMargin']);
connectCalculator('ownership', ownership, ['founder', 'cofounder', 'pool', 'investors']);

const issuance = byId('issuance-form');
const issuanceStatus = byId('issuance-status');
const reasons = {
  TRANSFERS_PAUSED: 'Transfers are paused.',
  SENDER_INELIGIBLE: 'The sender does not meet the sample identity rule.',
  RECIPIENT_INELIGIBLE: 'The recipient does not meet the sample identity rule.',
  INSUFFICIENT_HOLDINGS: 'The sender holds fewer units than requested.',
};

issuance.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = issuance.querySelector('button');
  button.disabled = true;
  issuanceStatus.textContent = 'Running simulation…';
  const data = Object.fromEntries(new FormData(issuance));
  for (const key of ['principalCents', 'unitPriceCents', 'requestedUnits', 'holdingUnits']) data[key] = Number(data[key]);
  for (const key of ['senderVerified', 'recipientVerified', 'paused']) data[key] = issuance.elements[key].checked;

  try {
    const response = await fetch('/v1/issuance/simulate', {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(data),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    const {transfer} = result;
    byId('token-result').textContent = transfer.allowed ? 'The proposed transfer passed the sample rules.'
      : transfer.reasons.map((reason) => reasons[reason]).join(' ');
    byId('issued-units').textContent = count.format(result.issuedUnits);
    byId('sender-units').textContent = count.format(transfer.senderAfter);
    byId('recipient-units').textContent = count.format(transfer.recipientAfter);
    byId('transfer-value').textContent = currency.format(transfer.transferValueCents / 100);
    issuanceStatus.textContent = '';
  } catch (error) {
    byId('token-result').textContent = 'No simulation result is available.';
    for (const id of ['issued-units', 'sender-units', 'recipient-units', 'transfer-value']) byId(id).textContent = '—';
    issuanceStatus.textContent = error.name === 'TimeoutError' ? 'The simulation timed out. Try again.' : error.message;
  } finally {
    button.disabled = false;
  }
});
