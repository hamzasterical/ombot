# Unauthorized transaction

> Sample bank policy. Synthetic content for demonstration only; not real regulation.

| Policy ID | Owner | Risk tier | Version | Review cycle |
|---|---|---|---|---|
| policy_unauthorized_txn | Fraud Operations | Critical | 3.2 | Every 12 months |

## 1. Purpose and scope
Sets out how OmBank handles a customer report that money left their account through a card payment, transfer, ATM withdrawal or direct debit that they did not make or authorize. It applies to all retail and premier checking and savings accounts, debit cards and digital banking channels. It does not cover payments the customer made themselves and now regrets (see the merchant dispute policy) or transfers sent to the wrong person by mistake (see the wrong recipient policy).

**How customers describe it:** "I see a transfer I never made"; "money left my account without my approval"; "there is a card payment I don't recognise".

## 2. Definitions
- **Unauthorized transaction:** a payment initiated by someone other than the customer, without the customer's permission, from which the customer received no benefit.
- **Authorized push payment (APP) scam:** the customer made the payment themselves after being deceived. Treated as fraud, but recorded separately because liability rules differ.
- **Provisional credit:** a temporary credit of the disputed amount while the investigation runs. It may be reversed if the investigation finds the transaction was authorized.

## 3. Common causes and indicators
- Credential theft or phishing (fake bank SMS, email or call asking for login details or an OTP)
- SIM swap, where the customer's phone number is moved to a new SIM controlled by a fraudster
- Card details compromised through skimming, a merchant data breach or online card testing
- Malware or remote-access apps on the customer's device
- Use by a family member or someone in the household
- Red flags: a new device or location shortly before the transaction, a recent password, phone or beneficiary change, transactions at unusual hours, several attempts in quick succession, or amounts close to daily limits

## 4. Mandatory investigation steps
1. Record the time of the report and the customer's own words.
2. Confirm the transaction ID, amount, date and time, channel (card present, online, ATM, transfer) and the device ID and location.
3. Compare the device and location with the customer's 90-day history and primary device.
4. Review security events for the previous 30 days: logins from new devices, failed logins, password resets, phone number or email changes, new beneficiaries.
5. Check whether other transactions on the account share the same device, merchant or pattern.
6. Ask the customer whether the card or phone is still in their possession and whether they shared any code, but never ask for the code itself.
7. If fraud is likely, propose a freeze on the payment or account. A freeze always needs human approval.

## 5. Authority matrix
| Action | Who may decide |
|---|---|
| Read-only checks, case notes, draft reply | Automated agent |
| Freeze a payment, card or account | Fraud officer (human approval required) |
| Provisional credit up to $2,500 | Fraud officer |
| Provisional credit above $2,500, or any APP scam reimbursement | Fraud team lead |
| Closing the case as "customer authorized" | Fraud team lead, after reviewing evidence |

## 6. Customer communication
- A human officer contacts the customer, confirms what has been secured and explains the investigation steps and timeline.
- Say what has been done ("we have blocked the card") and what happens next. Use plain language.
- Do not promise a refund before the investigation ends. Say that a decision on provisional credit will follow.
- Never ask for a PIN, full password, OTP or card security code. Remind the customer that OmBank never asks for these.
- Advise the customer to change passwords on linked email accounts and to report SIM swap suspicions to their mobile carrier.

## 7. Timelines (sample)
- Card or account freeze, once approved: immediate.
- The customer is told the outcome of a provisional credit decision within 10 business days.
- A full investigation can take up to 45 days.
- The customer receives a written outcome within 3 business days of the investigation closing.

## 8. Escalation triggers
- Several customers affected by the same merchant, device or IP pattern: escalate to Fraud Intelligence.
- Loss above $10,000, or a vulnerable customer (elderly, in financial hardship, or reporting coercion): escalate to the fraud team lead the same day.
- Suspected insider involvement: escalate to Internal Investigations, and do not discuss it with the customer.

## 9. Resolution outcomes
- **Confirmed unauthorized:** the provisional credit becomes final, the card is reissued and credentials are reset.
- **Customer authorized or benefited:** the provisional credit is reversed with 5 business days' written notice, and the reasons are given.
- **Inconclusive:** decide in the customer's favour where the evidence is balanced and the customer reported promptly.

## 10. Record keeping
Keep the case record, evidence reviewed, decisions and the approver's identity for 7 years.
