# VELTARIS Cloudflare operations

The VELTARIS operations Worker checks the existing application health and pilot storage readiness. It publishes an agent-readable manifest, OpenAPI, the current status and up to 12 recent operational receipts. The VELTARIS bank, servicing, sales and customer data remain in their existing systems. Its dedicated D1 database contains only fixed readiness indicators, timestamps and execution duration. Scheduled checks run every five minutes and expire records after seven days.

The deployment operator is the existing Founder OS Cloudflare integration. It pins this repository's source commit, tests the Worker without Cloudflare credentials, reuses the exact project resource names, verifies the bound D1 identity, and registers the release receipt in Founder OS. A short-lived, hashed release probe authority verifies the live Worker-to-D1-to-Vercel path. Deployments never require the central token in this repository or VELTARIS runtime.

The Cloudflare service is additive. Pilot requests and customer workspaces continue on the VELTARIS Vercel and database infrastructure.
