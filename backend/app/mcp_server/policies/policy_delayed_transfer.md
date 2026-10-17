# Delayed or pending transfer

> Sample bank policy. Synthetic content for demonstration only; not real regulation.

| Policy ID | Owner | Risk tier | Version | Review cycle |
|---|---|---|---|---|
| policy_delayed_transfer | Payments Operations | Moderate | 2.2 | Every 12 months |

## 1. Purpose and scope
Covers transfers that are taking longer than expected, are stuck as pending, or have left the customer's account but have not reached the recipient. It applies to transfers within OmBank, domestic transfers to other banks, instant transfers and international wires.

**How customers describe it:** "my transfer is still pending"; "the recipient has not received the money"; "my wire has been stuck for days".

## 2. Definitions
- **Cut-off time:** the latest time a transfer can be submitted for same-day processing (17:00 local time on business days).
- **Screening hold:** a pause while a payment is checked against fraud, sanctions and anti-money-laundering rules.
- **Intermediary bank:** a bank that passes an international wire between the sending and receiving banks, and may hold or charge it.

## 3. Common causes
- Submitted after the cut-off time, or on a weekend or public holiday
- A compliance or fraud screening hold
- A delay at the receiving bank or an intermediary bank
- Incorrect beneficiary details, so the receiving bank cannot apply the payment

## 4. Mandatory investigation steps
1. Check the transfer status and the submission time, against the cut-off and business days.
2. Check for a screening hold. Do not reveal the details of a sanctions or anti-money-laundering review to the customer.
3. Check the beneficiary details: name, account number or IBAN, bank code (SWIFT or routing number).
4. For international wires, request a payment trace from the intermediary bank.
5. Compare the elapsed time with the processing window below.

## 5. Authority matrix
| Action | Who may decide |
|---|---|
| Read-only checks, status update, draft reply | Automated agent |
| Request a payment trace | Payments officer |
| Release a screening hold | Compliance team only |
| Cancel and refund a transfer | Payments officer (human approval required) |
| Refund the transfer fee because of a bank delay | Payments officer |

## 6. Customer communication
- Share the current status and the expected completion time.
- If the transfer is on a screening hold, say that it is "under a routine review" without giving reasons.
- Ask the customer to check the beneficiary details with the recipient if anything looks wrong.
- Do not promise a delivery date for international wires that depend on other banks; give the usual range.

## 7. Processing windows (sample)
- Transfers within the bank: immediate.
- Domestic transfers to other banks: same business day if submitted before the 17:00 cut-off, otherwise the next business day.
- International wires: 2 to 5 business days, depending on intermediary banks.
- A compliance or fraud screening hold can add up to 2 business days.
- Escalate to a human when a transfer has been pending longer than its window.

## 8. Escalation triggers
- Pending longer than its processing window.
- The customer reports an urgent need (rent, medical bills, payroll): mark as priority.
- A trace shows the funds returned by the receiving bank: credit the customer and explain the reason.

## 9. Resolution outcomes
- Transfer delivered with a confirmation reference; or returned and credited back to the customer, with the transfer fee refunded if the delay was the bank's fault.

## 10. Record keeping
Keep traces, status history and customer contact notes for 7 years.
