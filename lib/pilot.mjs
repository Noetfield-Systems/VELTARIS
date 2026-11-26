const WORKFLOWS = new Set(['intake', 'servicing', 'reporting', 'integration']);
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

  return {name, email, company, workflow, context, requestId};
}
