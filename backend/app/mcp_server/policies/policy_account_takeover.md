# Account takeover

> Sample bank policy. Synthetic content for demonstration only; not real regulation.

| Policy ID | Owner | Risk tier | Version | Review cycle |
|---|---|---|---|---|
| policy_account_takeover | Fraud Operations | Critical | 2.4 | Every 12 months |

## 1. Purpose and scope
Covers reports that someone other than the customer has gained control of their online or mobile banking profile: changed the password, phone number or email, registered a new device, or added beneficiaries. It applies to all digital banking profiles. If money has already left the account, the unauthorized transaction policy applies as well.

**How customers describe it:** "someone changed my password"; "my account was hacked"; "I got a login alert from a device that isn't mine".

## 2. Definitions
- **Account takeover (ATO):** unauthorized access to a customer's banking profile that lets the attacker view, change or move money.
- **Step-up verification:** an extra identity check through a channel the attacker is unlikely to control, such as a callback to the number held before the change, or a branch visit with photo ID.

## 3. Common causes and indicators
- Phishing pages that capture the password and OTP in real time
- SIM swap, giving the attacker the customer's SMS codes
- Malware or remote-access apps installed on the customer's device
- A reused or leaked password from another website
- Red flags: login from a new device or country, password or phone change shortly after that login, a new beneficiary added within 24 hours of a credential change, notification settings switched off

## 4. Mandatory investigation steps
1. Review all logins, devices and profile changes for the last 30 days, and note the first suspicious event.
2. Check for newly added beneficiaries, changed transfer limits, and standing orders.
3. Review every outgoing transaction since the first suspicious login.
4. Lock the profile and revoke all active sessions and registered devices (human approval required).
5. Force a credential reset that can only be completed after step-up verification.
6. Remove beneficiaries the customer does not recognise, and restore the original phone number and email.

## 5. Authority matrix
| Action | Who may decide |
|---|---|
| Read-only review of logins, devices and transactions | Automated agent |
| Lock profile, revoke sessions, force reset | Fraud officer (human approval required) |
| Restore contact details after step-up verification | Fraud officer |
| Reimburse losses from the takeover | As in the unauthorized transaction policy |

## 6. Customer communication
- A human officer secures the account, resets credentials through a verified channel, and walks the customer through the next steps.
- Contact the customer only on contact details held **before** the suspicious change.
- Explain what was locked, what was changed, and how to log in again safely.
- Never ask for the PIN, password or OTP. Do not send reset links to an email or phone number the attacker may have added.
- Advise the customer to secure their email account, scan their device and contact their mobile carrier about SIM swaps.

## 7. Timelines (sample)
- Profile lock and session revocation, once approved: immediate.
- Credential reset completed within 1 business day of successful step-up verification.
- Any monetary claim follows the unauthorized transaction timelines (provisional credit decision within 10 business days, full investigation up to 45 days).

## 8. Escalation triggers
- Money moved, or new beneficiaries added: also open an unauthorized transaction case.
- The same device or IP linked to other customers: escalate to Fraud Intelligence.
- The customer cannot pass step-up verification: refer them to a branch with photo ID.

## 9. Resolution outcomes
- Access restored, the attacker's devices removed and the customer's contact details confirmed.
- Monitoring flag on the profile for 90 days, with alerts for any new device or beneficiary.

## 10. Record keeping
Keep login records, changes made, approvals and customer contact notes for 7 years.
