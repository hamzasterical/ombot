# Failed payment with money deducted

> Sample bank policy. Synthetic content for demonstration only; not real regulation.

| Policy ID | Owner | Risk tier | Version | Review cycle |
|---|---|---|---|---|
| policy_failed_payment | Payments Operations | Moderate | 2.0 | Every 12 months |

## 1. Purpose and scope
Covers card payments, bill payments and transfers that showed as failed, declined or timed out, but where the customer's balance went down anyway. It applies to card payments online and in store, app bill payments and outgoing transfers.

**How customers describe it:** "payment failed but I was charged"; "error shown but balance dropped"; "the app said declined but the money is gone".

## 2. Definitions
- **Authorization hold:** a temporary reservation of funds when a card payment is approved. It is not a completed charge.
- **Reversal:** the release of a hold, or the return of a settled amount, when the payment did not complete.
- **Reconciliation request:** an internal request to match OmBank's records against the merchant's or the payment network's.

## 3. Common causes
- A timeout between the bank and the merchant or payment network, after which the funds were held but the merchant saw a failure
- A duplicate authorization hold after the customer retried the payment
- A settlement delay, where the payment actually succeeded but the confirmation was late

## 4. Mandatory investigation steps
1. Check the transaction status: held (pending), settled or reversed.
2. Check for a pending authorization hold matching the amount and merchant.
3. Check whether the merchant received the payment (the merchant reference or the settlement file).
4. Check for an automatic reversal in the last 5 business days.
5. If the customer retried, check for a second successful payment for the same amount.
6. If it isn't reversed after 5 business days, open a reconciliation request.

## 5. Authority matrix
| Action | Who may decide |
|---|---|
| Read-only checks, draft reply | Automated agent |
| Open a reconciliation request | Payments officer |
| Refund a confirmed failed payment | Payments officer (human approval required) |
| Refund overdraft fees caused by a held amount | Payments officer, up to $105 (3 overdraft fees) |

## 6. Customer communication
- Explain the difference between a hold and a charge in plain language.
- Explain that most held amounts reverse automatically within 5 business days.
- If not reversed, confirm that a reconciliation request is open and that a refund will follow once confirmed.
- Advise the customer not to retry the payment until the hold is released, to avoid paying twice.
- Do not promise a refund before reconciliation confirms the payment failed.

## 7. Timelines (sample)
- Automatic reversal window: 5 business days from the failed payment.
- Reconciliation requests are answered within 10 business days.
- A confirmed refund is credited within 2 business days of the reconciliation result.

## 8. Escalation triggers
- The hold caused an overdraft or a missed bill payment: review the fees for a refund.
- Many failures with the same merchant or network on the same day: report to Payments Operations as a possible incident.
- No reversal and no reconciliation answer after 10 business days: escalate to the payments team lead.

## 9. Resolution outcomes
- Hold released automatically, or refund after reconciliation, plus any fees caused by the hold.
- If the payment actually succeeded, give the customer the merchant confirmation.

## 10. Record keeping
Keep the transaction records, the reconciliation reference and the outcome for 7 years.
