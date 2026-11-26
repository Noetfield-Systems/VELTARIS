import {neon} from '@neondatabase/serverless';
import {pilotFields} from '../lib/pilot.mjs';

function json(response, code, body) {
  response.setHeader('cache-control', 'no-store');
  return response.status(code).json(body);
}

export default async function handler(request, response) {
  const databaseUrl = process.env.VELTARIS_DATABASE_URL || process.env.DATABASE_URL;
  if (request.method === 'GET') {
    if (!databaseUrl) return json(response, 200, {available: false});

    try {
      const sql = neon(databaseUrl, {fetchOptions: {signal: AbortSignal.timeout(3500)}});
      await sql`SELECT id FROM pilot_requests LIMIT 0`;
      return json(response, 200, {available: true});
    } catch {
      return json(response, 200, {available: false});
    }
  }
  if (request.method !== 'POST') {
    response.setHeader('allow', 'GET, POST');
    return json(response, 405, {message: 'Method not allowed.'});
  }

  if (request.headers['sec-fetch-site'] === 'cross-site') {
    return json(response, 403, {message: 'Submit from the VELTARIS website.'});
  }
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json(response, 415, {message: 'Use application/json.'});
  }
  if (Number(request.headers['content-length']) > 4096) {
    return json(response, 413, {message: 'Request is too large.'});
  }

  let payload = request.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return json(response, 400, {message: 'Invalid JSON.'});
    }
  }

  const input = pilotFields(payload);
  if (!input) return json(response, 400, {message: 'Check the required fields and try again.'});
  if (!databaseUrl) return json(response, 503, {message: 'Pilot requests are temporarily unavailable.'});

  try {
    const sql = neon(databaseUrl, {fetchOptions: {signal: AbortSignal.timeout(8000)}});
    await sql`INSERT INTO pilot_requests
      (id, name, email, company, workflow, context, utm_source, utm_medium, utm_campaign, utm_content, entry_page)
      VALUES (${input.requestId}, ${input.name}, ${input.email}, ${input.company}, ${input.workflow}, ${input.context},
        ${input.utm_source}, ${input.utm_medium}, ${input.utm_campaign}, ${input.utm_content}, ${input.entry_page})
      ON CONFLICT (id) DO NOTHING`;
    return json(response, 201, {reference: input.requestId});
  } catch (error) {
    console.error('pilot_storage_error', {code: error.code || 'unavailable'});
    return json(response, 503, {message: 'We could not save your request. Please try again.'});
  }
}
