const venture = 'veltaris-capital';
const application = 'https://veltaris-capital.vercel.app';
const freshness = 15 * 60 * 1000;
const retention = 7 * 86400 * 1000;

function response(body, status = 200, cache = 'no-store') {
  return Response.json(body, {status, headers: {
    'cache-control': cache, 'access-control-allow-origin': '*',
    'x-content-type-options': 'nosniff',
  }});
}

async function probe(path, accept, fetcher) {
  try {
    const result = await fetcher(application + path, {
      redirect: 'manual', signal: AbortSignal.timeout(5500),
      headers: {accept: 'application/json'},
    });
    return result.ok && accept(await result.json());
  } catch {
    return false;
  }
}

export async function check(db, source, id, fetcher = fetch, clock = Date.now) {
  const started = clock();
  const [app, pilot] = await Promise.all([
    probe('/api/health', p => p?.status === 'ok' && p.service === venture, fetcher),
    probe('/api/pilot', p => p?.available === true, fetcher),
  ]);
  const checkedAt = clock();
  await db.batch([
    db.prepare(`INSERT INTO readiness_checks (id,checked_at,source,application,pilot,duration_ms)
      VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(id,checkedAt,source,Number(app),Number(pilot),Math.max(0,checkedAt-started)),
    db.prepare('DELETE FROM readiness_checks WHERE checked_at < ?').bind(checkedAt-retention),
  ]);
  return db.prepare('SELECT * FROM readiness_checks WHERE id = ?').bind(id).first();
}

export function snapshot(row, now = Date.now()) {
  if (!row) return {service:venture,status:'awaiting_check',latest:null};
  const app = row.application === 1;
  const pilot = row.pilot === 1;
  const status = now-row.checked_at > freshness ? 'stale' : app && pilot ? 'operational' : 'degraded';
  return {service:venture,status,latest:{
    id:row.id,source:row.source,checkedAt:new Date(row.checked_at).toISOString(),
    checks:{application:app,pilotIntake:pilot},durationMs:row.duration_ms,
  }};
}

async function canProbe(request, env) {
  const token = request.headers.get('authorization');
  if (!token || !/^Bearer [a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(env.RELEASE_PROBE_DIGEST || '')
      || Date.now() >= Number(env.RELEASE_PROBE_EXPIRES || 0)) return false;
  const actual = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token.slice(7))));
  const expected = env.RELEASE_PROBE_DIGEST.match(/../g);
  let mismatch = 0;
  for (let i=0;i<actual.length;i++) mismatch |= actual[i] ^ parseInt(expected[i],16);
  return mismatch === 0;
}

function manifest(origin) {
  return {
    name:'VELTARIS Capital', application, mode:'public_operational_read',
    openapi:origin+'/openapi.json',
    capabilities:[
      {id:'runtime_liveness',operation:'GET /health',auth:'public',effect:'read'},
      {id:'credit_workspace_readiness',operation:'GET /v1/status',auth:'public',effect:'read'},
      {id:'readiness_receipts',operation:'GET /v1/receipts',auth:'public',effect:'read'},
      {id:'pilot_inquiries',interface:application+'/private-credit.html#pilot',auth:'human_form',effect:'inquiry'},
      {id:'credit_servicing',interface:application+'/portal.html',auth:'organization_invitation',effect:'tenant_scoped'},
    ],
  };
}

function openapi(origin) {
  return {openapi:'3.1.0',info:{title:'VELTARIS operational status',version:'1.0.0'},servers:[{url:origin}],
    paths:Object.fromEntries([
      ['/health','Read Worker and D1 liveness'],
      ['/v1/status','Read most recent readiness check'],
      ['/v1/receipts','Read latest 12 readiness receipts'],
    ].map(([path,summary]) => [path,{get:{summary,responses:{
      200:{description:'Operational response'},503:{description:'Backing service unavailable or readiness degraded, stale or pending'},
    }}}])),
  };
}

export default {
  async fetch(request, env) {
    const {origin, pathname} = new URL(request.url);
    try {
      if (pathname === '/_ops/check' && request.method === 'POST') {
        if (!await canProbe(request,env)) return response({message:'Unauthorized'},401);
        const id = 'release:' + env.RELEASE_RUN;
        const prior = await env.DB.prepare('SELECT * FROM readiness_checks WHERE id = ?').bind(id).first();
        return response(snapshot(prior || await check(env.DB,'release',id)));
      }
      if (request.method !== 'GET') return response({message:'Method not allowed'},405);
      if (pathname === '/.well-known/uhail.json') return response(manifest(origin),200,'public,max-age=300');
      if (pathname === '/openapi.json') return response(openapi(origin),200,'public,max-age=300');
      if (pathname === '/health') {
        await env.DB.prepare('SELECT id FROM readiness_checks LIMIT 1').all();
        return response({service:venture,storage:'d1',status:'ok'});
      }
      if (pathname === '/v1/status' || pathname === '/') {
        const result = snapshot(await env.DB.prepare('SELECT * FROM readiness_checks ORDER BY checked_at DESC,id DESC LIMIT 1').first());
        return response(result,result.status === 'operational' ? 200 : 503,'public,max-age=20');
      }
      if (pathname === '/v1/receipts') {
        const r = await env.DB.prepare('SELECT * FROM readiness_checks ORDER BY checked_at DESC,id DESC LIMIT 12').all();
        return response({service:venture,receipts:r.results.map(row => snapshot(row,row.checked_at).latest)},200,'public,max-age=20');
      }
      return response({message:'Not found'},404);
    } catch {
      return response({service:venture,status:'storage_unavailable'},503);
    }
  },
  async scheduled(controller, env) {
    await check(env.DB,'scheduled','scheduled:'+controller.scheduledTime);
  },
};
