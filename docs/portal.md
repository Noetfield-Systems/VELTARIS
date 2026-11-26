# Founding Institutional Program workspace

The [institutional workspace](https://veltaris-capital.vercel.app/portal.html) uses invitation-only access for this pilot release. An operator can triage inbound pilot requests, edit stages and ownership, record a next action date, and provision an organization's initial owner. Owners can invite editors or viewers inside their organization. Editors can add or update facilities and upload documents. Viewers can read facilities, download documents, and export records. An operator can administer the queue and provision tenant access. The operator session has no tenant facility or document reads.

## Private pilot access

The operator passes a single-use activation link privately to the named recipient. The link expires after 48 hours. Activation creates a 12-hour, revocable, Secure, HttpOnly browser session. Sign out at the end of a shared-device session. Before signing out, use Create return link to store a single-use, seven-day return link privately. Creating another returns a fresh link and expires the previous one. If the session and return link are unavailable, ask an authorized operator or database owner to issue a new invitation. Pilot access uses a bearer invitation and an opaque session. Account sign-in, OIDC and MFA remain future identity work.

Each organization can hold up to 100 facilities and 20 documents. Documents accept PDF, CSV and UTF-8 text, up to 2 MiB each, and are stored as Postgres byte arrays within the dedicated VELTARIS database. Document responses are authenticated, served as downloads, and recorded in the workspace activity feed. Source documents can contain additional specialist confidentiality or location requirements. Agree the pilot's scope and retention before loading live borrower records. Pilot documents are stored in the dedicated Neon database in the United States.

The schedule is a projection using the interest-only calculation and whole-cent amounts. It supports portfolio and single-facility CSV export. Use the separate [loan servicing section](servicing.md) to register externally cleared repayments, match statement lines, and export the balanced servicing subledger.

## Operations and restoration

Use the dedicated VELTARIS Neon project. Keep roles distinct.

- `veltaris_intake` may insert a lead and read only its ID.
- `veltaris_portal` may invoke the scoped functions in `portal`. It has no direct lead, facility, session or document table reads.
- A separate database owner creates the runtime roles and applies `npm run migrate` with `VELTARIS_MIGRATION_DATABASE_URL`. Create the project-specific runtime roles before applying the grants. Database credentials, raw invitations and customer data must remain outside source and build logs.

Production data, invitations and sessions reside in Neon. The Vercel deployment hosts the website and API. A future transfer requires restoring the database, recreating credentials, configuring the target origin, and verifying tenant access, data integrity, operator actions, and intake. Use verified synthetic records for release checks. Since cookies are host-scoped, activate a fresh invitation after moving to a different origin.

See the [prospect queue and pilot measurement plan](pilot-outreach.md) for the sales workflow. The operator console tracks work and evidence status. Software payment routing needs a verified VELTARIS-owned arrangement.
