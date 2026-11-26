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

Use a dedicated database in a region consistent with VELTARIS' customer commitments. Set `VELTARIS_DATABASE_URL` on this project only or connect a dedicated Neon instance's `DATABASE_URL`. Run `npm run migrate` through an authorized operator with the dedicated connection before enabling the public form. Test with an explicit synthetic request, verify one record across a retry, then remove that synthetic record. Limit database access to authorized operators, apply an appropriate retention policy, and add abuse monitoring and notification before opening high-volume acquisition.

## Transfer to the permanent host

1. Clone this repository and record the running commit, deployment ID and environment structure.
2. Use `npm ci` and `npm test`. Serve the public directory and map Node handlers under `/api`.
3. For any connected database, transfer or export and restore the VELTARIS database over an authenticated channel. Compare row counts and sample reference IDs using authorized access. Move secrets through the destination's secret manager.
4. Verify the homepage, workspace, health handler and synthetic pilot insert. Make one environment the write target before switching the public address.
5. Retain a rollback route and reconcile any intake received during cutover by the UUID reference.

## Scheduled verification

The GitHub workflow is configured to run daily at 16:30 UTC and on manual dispatch. It runs unit tests, verifies the homepage, sample workspace and health endpoint, and reports the read-only pilot storage status. Re-run the live checks from an operator workstation with `node scripts/smoke.mjs`. These checks preserve a technical evidence trail. Commercial evidence still needs accountable operators and private records.
