import {campaignTags,carryCampaign} from './campaign.mjs';

const form = document.querySelector('#pilot-form');
const status = document.querySelector('#pilot-status');
const button = form.querySelector('button');
const fields = form.querySelectorAll('input, select, textarea');
const attribution = {...campaignTags(location.href), entry_page: location.pathname};
carryCampaign();
let requestId = crypto.randomUUID();

try {
  const response = await fetch('/api/pilot', {signal: AbortSignal.timeout(5000)});
  const {available} = await response.json();
  if (response.ok && available) {
    for (const field of fields) field.disabled = false;
    button.disabled = false;
    status.textContent = '';
  } else {
    status.textContent = 'Pilot intake is temporarily unavailable.';
  }
} catch {
  status.textContent = 'Pilot intake is temporarily unavailable.';
}

form.addEventListener('input', () => {
  requestId = crypto.randomUUID();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;

  const payload = Object.fromEntries(new FormData(form));
  const submittedId = requestId;
  button.disabled = true;
  status.textContent = 'Submitting your request…';

  try {
    const response = await fetch('/api/pilot', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({...payload, ...attribution, requestId: submittedId}),
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Please try again.');
    status.textContent = 'Request received. Your reference is ' + result.reference + '.';
    if (requestId === submittedId) form.reset();
    requestId = crypto.randomUUID();
  } catch (error) {
    status.textContent = error.name === 'TimeoutError'
      ? 'The request timed out. Please try again.'
      : error.message;
  } finally {
    button.disabled = false;
  }
});
