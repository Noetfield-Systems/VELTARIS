import {servicingInput} from '../lib/servicing.mjs';
import {neon} from '@neondatabase/serverless';
import {facilityFromInput} from '../public/credit.mjs';
import {cookie, digest, documentPayload, isId, isToken, LEAD_STAGES, parseDate, requiredText, sessionKey, token} from '../lib/portal.mjs';

const errors = {
  unauthorized: [401, 'Activate an invitation to use this workspace.'],
  forbidden: [403, 'Your workspace role does not allow this action.'],
  not_found: [404, 'The requested record is unavailable.'],
  conflict: [409, 'This facility changed. Refresh before saving again.'],
  receipt_duplicate: [409, 'This receipt reference belongs to a different entry.'],
  receipt_terms: [409, 'Use a period on the facility schedule and a date between its start and today.'],
  principal_exceeded: [409, 'Principal received would exceed the facility principal.'],
  statement_mismatch: [409, 'The statement amount must match the receipt and its date must be between receipt and today.'],
  statement_duplicate: [409, 'This statement reference is already matched.'],
  already_matched: [409, 'This receipt has already been reconciled.'],
  receipt_reversed: [409, 'This receipt has previously been reversed.'],
  capacity: [409, 'This workspace has reached its pilot storage limit.'],
};

const reply = (response, value) => {
  if (value == null || value.error) {
    const [status, message] = errors[value?.error || 'unauthorized'];
    return response.status(status).json({message});
  }
  return response.status(200).json(value);
};
const query = async (statement) => (await statement)[0]?.result;

function payload(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('Send JSON.');
  if (Number(req.headers['content-length']) > 3000000) throw new Error('The request is too large.');
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Send a valid request.');
  return body;
}

function existingId(value) {
  if (!isId(value)) throw new Error('Enter a valid record ID.');
  return value;
}

function command(body) {
  switch (body.action) {
    case 'return-invite':
      return null;
    case 'book-receipt':
    case 'match-receipt':
    case 'reverse-receipt':
      return {id: existingId(body.id), ...servicingInput(body)};
    case 'facility': {
      const id = body.id == null ? null : existingId(body.id);
      if (id && (!Number.isInteger(body.version) || body.version < 1 || body.version > 2147483647)) throw new Error('Refresh the facility before editing.');
      return {...facilityFromInput(body), id, version: id ? body.version : null};
    }
    case 'upload':
      return {facilityId: existingId(body.facilityId), ...documentPayload(body)};
    case 'provision': {
      if (!['owner','editor','viewer'].includes(body.role)) throw new Error('Choose a permitted workspace role.');
      const organizationId = body.organizationId == null || body.organizationId === '' ? null : existingId(body.organizationId);
      return {organizationId, organization: typeof body.organization === 'string' && body.organization.trim()
        ? requiredText(body.organization, 100, 'Organization') : null, name: requiredText(body.name, 100, 'Member name'), role: body.role};
    }
    case 'followup':
      if (!LEAD_STAGES.includes(body.stage) || typeof body.notes !== 'string' || body.notes.length > 800) throw new Error('Check the stage and notes.');
      return {id: existingId(body.id), stage: body.stage, owner: requiredText(body.owner, 100, 'Follow-up owner'),
        nextDate: parseDate(body.nextDate), notes: body.notes.trim()};
    default:
      throw new Error('Choose a supported action.');
  }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('vary', 'Cookie');
  const key = sessionKey(req.headers.cookie);
  const databaseUrl = process.env.VELTARIS_PORTAL_DATABASE_URL;

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('allow', 'GET, POST');
    return res.status(405).json({message:'Use GET or POST.'});
  }
  if (req.method === 'POST' && (req.headers['sec-fetch-site'] === 'cross-site'
      || (req.headers.origin && req.headers.origin !== (process.env.VELTARIS_PORTAL_ORIGIN || 'https://veltaris-capital.vercel.app')))) {
    return reply(res, {error:'forbidden'});
  }

  let body, input;
  if (req.method === 'POST') {
    try {
      body = payload(req);
      if (body.action === 'activate') {
        if (!isToken(body.invitation)) throw new Error('Enter a valid invitation code.');
      } else if (body.action !== 'signout') {
        if (!key) return reply(res, null);
        input = command(body);
      }
    } catch (error) {
      return res.status(400).json({message:error.message});
    }
  }

  if (!key && body?.action !== 'activate') return reply(res, null);
  if (!databaseUrl) return res.status(503).json({message:'The private workspace is temporarily unavailable.'});

  try {
    const sql = neon(databaseUrl, {fetchOptions:{signal:AbortSignal.timeout(12000)}});
    if (req.method === 'GET') {
      const params = new URL(req.url, 'https://workspace.invalid').searchParams;
      const servicingId = params.get('servicing');
      if (servicingId) {
        if (!isId(servicingId)) return reply(res, {error:'not_found'});
        return reply(res, await query(sql`SELECT portal.servicing(${key},${servicingId}::uuid) AS result`));
      }
      const documentId = params.get('document');
      if (!documentId) return reply(res, await query(sql`SELECT portal.dashboard(${key}) AS result`));
      if (!isId(documentId)) return reply(res, {error:'not_found'});
      const document = await query(sql`SELECT portal.download_document(${key},${documentId}::uuid) AS result`);
      if (!document || document.error) return reply(res, document);
      const filename = encodeURIComponent(document.name).replace(/['()*!]/g, (char) => '%' + char.charCodeAt(0).toString(16));
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('content-disposition', "attachment; filename*=UTF-8''" + filename);
      return res.status(200).send(Buffer.from(document.contents, 'base64'));
    }

    switch (body.action) {
      case 'activate': {
        const secret = token();
        if (!await query(sql`SELECT portal.redeem(${digest(body.invitation)},${digest(secret)}) AS result`))
          return res.status(401).json({message:'This invitation has expired or was already used.'});
        res.setHeader('set-cookie', cookie(secret));
        return res.status(200).json({active:true});
      }
      case 'signout':
        await sql`SELECT portal.sign_out(${key})`;
        res.setHeader('set-cookie', cookie('', 0));
        return res.status(200).json({active:false});
      case 'return-invite': {
        const invitation = token();
        const result = await query(sql`SELECT portal.return_invitation(${key},${digest(invitation)}) AS result`);
        if (!result || result.error) return reply(res, result);
        return reply(res, {invitation});
      }
      case 'book-receipt':
        return reply(res, await query(sql`SELECT portal.book_receipt(${key},${input.id}::uuid,${input.ref},${input.date}::date,${input.period}::int,${input.principal}::bigint,${input.interest}::bigint) AS result`));
      case 'match-receipt':
        return reply(res, await query(sql`SELECT portal.match_receipt(${key},${input.id}::uuid,${input.ref},${input.date}::date,${input.amount}::bigint) AS result`));
      case 'reverse-receipt':
        return reply(res, await query(sql`SELECT portal.reverse_receipt(${key},${input.id}::uuid,${input.reason}) AS result`));
      case 'facility':
        return reply(res, await query(sql`SELECT portal.save_facility(${key},${input.id}::uuid,${input.version}::int,${JSON.stringify(input)}::jsonb) AS result`));
      case 'upload':
        return reply(res, await query(sql`SELECT portal.save_document(${key},${input.facilityId}::uuid,${input.filename},${input.media},${input.data}) AS result`));
      case 'provision': {
        const invitation = token();
        const result = await query(sql`SELECT portal.provision(${key},${input.organizationId}::uuid,${input.organization},${input.name},${input.role},${digest(invitation)}) AS result`);
        if (!result || result.error) return reply(res, result);
        return reply(res, {...result, invitation});
      }
      case 'followup':
        return reply(res, await query(sql`SELECT portal.follow_up(${key},${input.id}::uuid,${input.stage},${input.owner},${input.nextDate}::date,${input.notes}) AS result`));
    }
  } catch (error) {
    if (error.code === 'P0409') return res.status(409).json({message:'Principal, rate, term and start date are locked after a repayment is recorded.'});
    if (error.code === '23502' || error.code === '23514') return res.status(400).json({message:'Check the required workspace fields.'});
    console.error('portal_db_error', {code: error.code || 'unavailable'});
    return res.status(503).json({message:'The private workspace is temporarily unavailable.'});
  }
}
