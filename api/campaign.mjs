import {neon} from '@neondatabase/serverless';

const variants = new Set(['control-landscape','journal-square','founder-post']);
const events = new Set(['landing','demo','demo_match','pilot_intent']);

export default async function handler(req,res) {
  res.setHeader('cache-control','no-store');
  if (req.method !== 'POST') {
    res.setHeader('allow','POST');
    return res.status(405).end();
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).end();
  if (Number(req.headers['content-length']) > 400) return res.status(413).end();
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') return res.status(415).end();
  let input;
  try {input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;}
  catch {return res.status(400).end();}
  if (!variants.has(input?.variant) || !events.has(input?.event)) return res.status(400).end();

  const url = process.env.VELTARIS_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) return res.status(503).end();
  try {
    const sql = neon(url,{fetchOptions:{signal:AbortSignal.timeout(4000)}});
    await sql`SELECT public.record_veltaris_campaign(${input.variant},${input.event})`;
    return res.status(204).end();
  } catch (error) {
    console.error('campaign_count_error',{code:error.code || 'unavailable'});
    return res.status(503).end();
  }
}
