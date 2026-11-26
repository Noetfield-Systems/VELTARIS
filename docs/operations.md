# Release and data operations

## Temporary release

The public deployment is isolated in a dedicated Vercel project. The GitHub repository is the source of record for application code. Deploy the same verified files using Vercel CLI or a Git integration, without copying any other venture's environment. Use the public default Vercel domain during development.

The sample workspace holds fictional records in sessionStorage. Portfolio and schedule CSV exports stay in the browser. The sample identifier and published sample amounts are independent of any customer data.

## Pilot API

| Route | Behaviour |
|---|---|
| GET /api/health | 200 and JSON service identifier |
| GET /api/pilot | 200 with `available`, which reports whether the isolated pilot table can be queried |
| POST /api/pilot | JSON request with `requestId` (UUIDv4), `name`, `email`, `company`, `workflow` and optional `context`. An accepted request is inserted once per ID. Response returns the reference after the write. |
| Invalid POST | 400 for invalid fields, 403 for cross-site browser requests, 413 for an oversized declared body, and 415 for unsupported media |
| Storage problem | 503 response and no success status |

The live Vercel deployment uses a dedicated VELTARIS Neon Postgres project in AWS US East 1. The public intake notice discloses United States storage. Keep confidential borrower and investor information outside this intake workflow. The production secret is set only in Vercel. Its database role can insert pilot fields and read only the request ID for availability and duplicate detection. Operator access uses the separate authorized Neon project session. Put no lead data or credentials in the GitHub repository.

An authorized operator can open the dedicated VELTARIS project in Neon and run the following query. Exclude synthetic test contacts from commercial metrics.

```sql
SELECT id, created_at, name, company, email, workflow, context
FROM public.pilot_requests
WHERE email NOT LIKE '%@example.test'
ORDER BY created_at DESC
LIMIT 50;
```

For a replacement database, use an authorized owner connection for `npm run migrate` before configuring the restricted intake connection. Establish routine triage, retention, monitoring, and backup once the operator workflow is assigned.

The public `POST /v1/issuance/simulate` validates fictional CAD terms and returns calculated units and a policy result without persistence. See the [live OpenAPI contract](https://veltaris-capital.vercel.app/v1/openapi.json).

## Transfer to the permanent host

1. Clone this repository and record the running commit, deployment ID and environment structure.
2. Use `npm ci` and `npm test`. Serve the public directory and map Node handlers under `/api`.
3. For any connected database, transfer or export and restore the VELTARIS database over an authenticated channel. Compare row counts and sample reference IDs using authorized access. Move secrets through the destination's secret manager.
4. Verify the homepage, workspace, health handler and synthetic pilot insert. Make one environment the write target before switching the public address.
5. Retain a rollback route and reconcile any intake received during cutover by the UUID reference.

## Scheduled verification

The GitHub workflow is configured to run daily at 16:30 UTC and on manual dispatch. It runs unit tests, verifies the homepage, sample workspace, Capital Lab, API contract and health endpoint, and checks the read-only pilot storage status. Re-run the live checks from an operator workstation with `node scripts/smoke.mjs`. These checks preserve a technical evidence trail. Commercial evidence still needs accountable operators and private records.
