# Failed payment with money deducted

> Sample bank policy. Synthetic content for demonstration only; not real regulation.

## Common causes
- Timeout between the bank and the merchant or payment network
- Duplicate authorization hold
- Settlement delay

## Standard checks
- Check the transaction status and any pending authorization hold
- Check whether the merchant received the payment
- Check for an automatic reversal in the last 5 business days

## Standard response
Explain that most held amounts reverse automatically within 5 business days. If not reversed, open a reconciliation request and refund once confirmed.

## Reference values (sample)
- Automatic reversal window: 5 business days from the failed payment.
- Reconciliation requests are answered within 10 business days.
