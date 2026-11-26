# Institutional loan servicing

Open an organization facility in the [institutional workspace](https://veltaris-capital.vercel.app/portal.html). The servicing section shows outstanding principal, recorded cash, matched cash and cash awaiting reconciliation. Projected terms and schedule are displayed above the actual receipt register. An editor or owner records a completed external receipt, allocates CAD cents to principal and interest, and assigns a payment period. A viewer can read and export. An owner can reverse an entry with a reason.

## Operating workflow

1. Obtain the external proof of receipt. Use a reference unique to the organization, and enter the actual received date. Replaying the same reference and fields returns the original receipt. Conflicting reuse is rejected.
2. Open **Unmatched only** to review pending receipts. Match a receipt to one bank statement line by entering its source reference, date and exact CAD amount. Include a bank-account or source identifier in the statement reference when references overlap. A cleared statement date can follow the receipt date. A mismatch or reused active reference leaves the receipt unmatched.
3. Export the servicing journal for review. A receipt debits cash and credits principal receivable and cash-basis interest income. Reversal preserves the original and adds corresponding inverse lines. The reversal corrects this subledger and does not issue a payment or refund. Economic terms are locked after the first receipt to keep historical context stable.

Operational limits in this release are CAD, manual one-to-one matching, and 1,000 lifetime receipts per facility. The module stores records of externally completed payments. Bank feeds, automatic matching, processor execution, multi-currency, fund GL integration and full accrual accounting remain outside this release.

## Benchmark criteria

| Benchmark | Reference workflow | VELTARIS workflow |
|---|---|---|
| Carta Loan Operations | Cash reconciliation and journal entries connected to loan servicing | Receipt register, amount and reference controls, balanced servicing journal, reversal and CSV. Fund GL integration pending. |
| Figure | Payment processing, billing records and servicing operations | Projected schedule and an auditable record of received cash. Payment processing and distribution remain outside this release. |

[Carta Loan Operations](https://carta.com/fund-management/loan-operations/) · [Figure filed servicing description](https://investors.figure.com/static-files/c993798c-bfd6-47ac-9685-96d2f637722e)
