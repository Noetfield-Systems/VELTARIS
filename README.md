# VELTARIS Capital

Independent Canadian-origin software for private-credit operations. The temporary Vercel deployment supports product demonstrations and software-pilot scoping.

- [Temporary website](https://veltaris-capital.vercel.app/)
- [Credit workspace](https://veltaris-capital.vercel.app/workspace.html)
- [Competitive feature matrix](docs/benchmarks.md)
- [Commercial plan, fundraising and operating ownership](docs/commercial.md)
- [Provisional 36-package execution map](docs/execution.md)
- [Portability and pilot API](docs/operations.md)

The workspace uses fictional records and browser-session storage. It supports adding and updating facilities, stage and asset filters, stage review, fixed-interest servicing previews, and CAD CSV exports. An interest-only schedule uses month-end clamping and a maturity principal payment.

## Local development

```sh
npm ci
npm test
python3 -m http.server 4173 --directory public
```

Serve UI and API together with Vercel CLI for pilot flow development. The pilot form opens when its isolated Postgres schema is reachable. Keep actual pilot lead data in that private database. Keep confidential facility data out of the public sample workspace.

The deployment supports software demonstrations. Hosted software fees, customer agreements, issuance, custody, settlement, and partner activity each need their own evidence before reporting commercial or financial activity.
