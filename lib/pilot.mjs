const WORKFLOWS = new Set(['intake', 'servicing', 'reporting', 'integration']);
const CAMPAIGN_FIELDS = ['utm_source','utm_medium','utm_campaign','utm_content'];
const ENTRY_PAGES = new Set(['/','/private-credit.html']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function pilotFields(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const field = (key) => typeof data[key] === 'string' ? data[key].trim() : '';
  const name = field('name');
  const email = field('email').toLowerCase();
  const company = field('company');
  const workflow = field('workflow');
  const context = field('context');
  const requestId = field('requestId').toLowerCase();

  if (!name || name.length > 100 || !company || company.length > 120
    || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !WORKFLOWS.has(workflow) || context.length > 600 || !UUID.test(requestId)
    || field('website')) return null;

  const attribution = Object.fromEntries(CAMPAIGN_FIELDS.map((key) => {
    const value = field(key);
    return [key, /^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(value) ? value : null];
  }));
  const page = field('entry_page');
  return {name, email, company, workflow, context, requestId, ...attribution,
    entry_page: ENTRY_PAGES.has(page) ? page : null};
}
