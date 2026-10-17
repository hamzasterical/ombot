# Duplicate charge or merchant dispute

> Sample bank policy. Synthetic content for demonstration only; not real regulation.

| Policy ID | Owner | Risk tier | Version | Review cycle |
|---|---|---|---|---|
| policy_duplicate_charge | Card Disputes | Moderate | 2.5 | Every 12 months |

## 1. Purpose and scope
Covers card charges the customer agreed to in principle but disputes: the same purchase charged twice, a subscription that kept billing after cancellation, goods or services not delivered, or a promised refund that never arrived. It applies to debit card payments. Charges the customer did not make at all are handled under the unauthorized transaction policy.

**How customers describe it:** "I was charged twice"; "the merchant never refunded me"; "I cancelled my subscription but they still bill me".

## 2. Definitions
- **Duplicate charge:** two settled charges for the same purchase (same merchant, amount and approximate time) where the customer received one item or service.
- **Chargeback:** a formal dispute raised by OmBank through the card network to reclaim funds from the merchant's bank.
- **Temporary credit:** a credit of the disputed amount while a chargeback is in progress.

## 3. Common causes
- The merchant billed twice
- A retry after a timeout that was captured twice
- A cancelled subscription that is still billing
- Goods or services not delivered, or not as described
- A refund promised by the merchant that never arrived

## 4. Mandatory investigation steps
1. Compare both charges: amount, time and merchant ID. Check whether one is still only a pending hold, which will drop off by itself.
2. Check the merchant's complaint history and any open disputes against them.
3. Ask the customer for proof of cancellation, return or non-delivery (emails, tracking numbers, cancellation confirmations).
4. Confirm the customer has contacted the merchant first, or explain why they could not.
5. Check that the dispute is within the time limit: 120 days from the charge, or from the expected delivery date.

## 5. Authority matrix
| Action | Who may decide |
|---|---|
| Read-only checks, draft reply | Automated agent |
| Refund a confirmed duplicate charge | Disputes officer (human approval required) |
| Raise a chargeback and grant temporary credit | Disputes officer |
| Final decision when the merchant rejects the chargeback | Disputes team lead |

## 6. Customer communication
- For a confirmed duplicate, apologise for the inconvenience and confirm the refund date.
- For other disputes, explain the chargeback process and timeline, and what evidence helps.
- Make clear that a temporary credit may be reversed if the merchant proves the charge was valid.
- Suggest the customer cancels recurring payments with the merchant directly, and offer to block the merchant on the card.

## 7. Reference values (sample)
- A confirmed duplicate charge is refunded within 5 business days.
- Merchant disputes (non-delivery, cancelled subscription, refund not received) take up to 45 days.
- Disputes must be raised within 120 days of the charge or the expected delivery date.

## 8. Escalation triggers
- The merchant has 5 or more open complaints: flag to Merchant Risk.
- The disputed amount is above $1,000: second review by the disputes team lead.
- The customer reports aggressive or deceptive merchant behaviour: consider the scam policy.

## 9. Resolution outcomes
- Refund of the duplicate; chargeback won and temporary credit made final; or chargeback lost, with the reasons and the merchant's evidence explained.

## 10. Record keeping
Keep the dispute evidence, network references and decisions for 7 years.
