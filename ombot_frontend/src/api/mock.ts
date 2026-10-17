import type {
  Case,
  Category,
  Decision,
  LowTierAuditItem,
  Metrics,
  SubmitComplaintPayload,
  SubmitComplaintResponse,
  Tier,
} from './types'

export const SEED_CATEGORIES: Category[] = [
  // Critical
  {
    id: 'unauthorized_transaction',
    name: 'Unauthorized Transaction',
    tier: 'critical',
    description: 'Fraudulent charges or payments executed without account holder consent or knowledge.',
    source: 'seed',
  },
  {
    id: 'account_takeover',
    name: 'Account Takeover',
    tier: 'critical',
    description: 'Compromised credentials, unauthorized phone/email swap, or unauthorized access to customer account.',
    source: 'seed',
  },
  {
    id: 'lost_or_stolen_device',
    name: 'Lost or Stolen Device',
    tier: 'critical',
    description: 'Device with active banking app or biometric token reported missing, stolen, or forcefully cloned.',
    source: 'seed',
  },
  // Moderate
  {
    id: 'wrong_recipient_transfer',
    name: 'Wrong Recipient Transfer',
    tier: 'moderate',
    description: 'Funds inadvertently wired to incorrect IBAN, phone number, or routing tag by the customer.',
    source: 'seed',
  },
  {
    id: 'failed_payment_money_deducted',
    name: 'Failed Payment Money Deducted',
    tier: 'moderate',
    description: 'POS or online transaction reported as failed at checkout, but customer ledger shows debit.',
    source: 'seed',
  },
  {
    id: 'delayed_or_pending_transfer',
    name: 'Delayed or Pending Transfer',
    tier: 'moderate',
    description: 'Outbound or inbound SEPA/ACH/Wire transfer exceeding standard SLA clearing windows.',
    source: 'seed',
  },
  {
    id: 'duplicate_charge_or_merchant_dispute',
    name: 'Duplicate Charge / Merchant Dispute',
    tier: 'moderate',
    description: 'Merchant double billing, incorrect settlement amount, or subscription cancellation ignored.',
    source: 'seed',
  },
  // Low
  {
    id: 'app_or_login_issue',
    name: 'App or Login Issue',
    tier: 'low',
    description: 'Temporary password reset loop, biometric facial ID glitch, or minor UI loading spinner.',
    source: 'seed',
  },
  {
    id: 'fees_and_charges_question',
    name: 'Fees and Charges Question',
    tier: 'low',
    description: 'Customer inquiry regarding foreign FX markups, ATM withdrawal fees, or tier plan costs.',
    source: 'seed',
  },
  {
    id: 'general_frustration_or_feedback',
    name: 'General Frustration / Feedback',
    tier: 'low',
    description: 'User sentiment feedback, suggestion for feature enhancement, or dissatisfaction with service queue times.',
    source: 'seed',
  },
  // Seeded human-added category to demonstrate learning loop
  {
    id: 'crypto_partner_deposit_glitch',
    name: 'Crypto Partner Deposit Glitch',
    tier: 'moderate',
    description: 'Third-party crypto on-ramp partner API gateway failure during fiat clearing.',
    source: 'human_added',
  },
]

let categoriesStore: Category[] = [...SEED_CATEGORIES]

export const INITIAL_CASES: Case[] = [
  // 1. Critical case with proposed freeze_payment awaiting approval
  {
    id: 'CASE-8821',
    customerId: 'CUST-90142',
    receivedAt: '2026-10-16T22:15:00Z',
    tier: 'critical',
    status: 'awaiting_approval',
    unknownCategory: false,
    complaintText:
      'URGENT: I woke up this morning to three separate charges totaling $4,850 to a merchant called "ApexCrypto Global" in Cyprus. I was asleep in London! My card was in my wallet. I never authorized this transfer, and I suspect someone has breached my account. Freeze this payment immediately before it clears!',
    categories: [
      {
        categoryId: 'unauthorized_transaction',
        categoryName: 'Unauthorized Transaction',
        confidence: 0.98,
        supportingQuote: 'three separate charges totaling $4,850... never authorized this transfer',
      },
      {
        categoryId: 'account_takeover',
        categoryName: 'Account Takeover',
        confidence: 0.74,
        supportingQuote: 'suspect someone has breached my account',
      },
    ],
    report: {
      summary:
        'High-velocity international debit anomaly flagged. $4,850 outbound to high-risk merchant from unfamiliar IP range. Transaction currently in 2-hour settlement queue.',
      likelyCauses: [
        'Compromised virtual card PAN via third-party web skimmer',
        'Session token interception on unsecured public Wi-Fi',
      ],
      policyRefs: ['FinCrime Circular 4A (Mandatory Payment Freeze on Unauthorized Claims > $2,000)', 'PSD2 Article 73'],
      evidence: [
        { label: 'Outbound Amount', value: '$4,850.00 (3 tranches)' },
        { label: 'Merchant', value: 'ApexCrypto Global (Cyprus)' },
        { label: 'Device IP', value: '185.220.101.5 (Tor Exit Node)' },
        { label: 'Customer Regular IP', value: '82.165.197.1 (London, UK)' },
        { label: 'Card Status', value: 'Virtual Card #4092 Active' },
        { label: 'Settlement Window', value: 'Clears in 42 minutes' },
      ],
      recommendedNextStep:
        'Execute immediate emergency payment freeze on clearing batch #9921 and lock Virtual Card #4092.',
    },
    toolTrace: [
      {
        step: 1,
        tool: 'check_transaction_ledger',
        args: { customerId: 'CUST-90142', timeframe: '24h' },
        result: { flaggedTransactions: 3, totalAmount: 4850, merchant: 'ApexCrypto Global', status: 'pending_settlement' },
        timestamp: '2026-10-16T22:15:30Z',
      },
      {
        step: 2,
        tool: 'scan_device_fingerprints',
        args: { customerId: 'CUST-90142', sessionIds: ['sess_99182a'] },
        result: { deviceMismatch: true, ipClassification: 'tor_exit_node', geoDistanceKm: 3200 },
        timestamp: '2026-10-16T22:16:10Z',
      },
      {
        step: 3,
        tool: 'risk_score_v4',
        args: { caseType: 'fraud_escalation', anomalyConfidence: 0.98 },
        result: { riskTier: 'critical', fraudScore: 94, actionRequired: 'freeze_payment' },
        timestamp: '2026-10-16T22:16:45Z',
      },
    ],
    proposedAction: {
      type: 'freeze_payment',
      details: {
        batchId: 'BATCH-CY-9921',
        amount: 4850.0,
        merchant: 'ApexCrypto Global',
        targetCard: 'Virtual Card ending 4092',
        freezeReason: 'Suspected Account Takeover & Unauthorized Card Drain',
      },
      requiresApproval: true,
    },
    draftReply:
      'Dear Customer,\n\nWe have reviewed your urgent report. Our fraud prevention desk has staged an immediate freeze on the pending $4,850 transactions to ApexCrypto Global and temporarily restricted Virtual Card #4092 to safeguard your balance.\n\nA senior fraud investigator will reach out to verify your recent activity within 30 minutes.\n\nSincerely,\nFintech Trust & Safety Team',
  },

  // 2. Critical case: Account Takeover under human investigation
  {
    id: 'CASE-8819',
    customerId: 'CUST-77319',
    receivedAt: '2026-10-16T21:40:00Z',
    tier: 'critical',
    status: 'awaiting_human',
    unknownCategory: false,
    complaintText:
      'Someone changed the phone number and recovery email linked to my account without my permission. I received SMS alerts saying 2FA was updated, and now I am completely locked out of my mobile app. Please secure my savings account immediately!',
    categories: [
      {
        categoryId: 'account_takeover',
        categoryName: 'Account Takeover',
        confidence: 0.96,
        supportingQuote: 'Someone changed the phone number and recovery email linked to my account without my permission',
      },
      {
        categoryId: 'lost_or_stolen_device',
        categoryName: 'Lost or Stolen Device',
        confidence: 0.42,
        supportingQuote: 'now I am completely locked out of my mobile app',
      },
    ],
    report: {
      summary:
        'Critical SIM swap or credential stuffing signature detected. Primary MFA phone number changed from UK (+44) to foreign VOIP (+1) at 21:35 UTC followed by password reset.',
      likelyCauses: ['SIM Swap attack on customer telco', 'Credential re-use from third-party breach'],
      policyRefs: ['Account Security Protocol Sec 8.2 (Credential Revocation)', 'UK Banking Act Customer Safeguard'],
      evidence: [
        { label: 'Previous Phone', value: '+44 7700 900142' },
        { label: 'New Phone (VOIP)', value: '+1 202 555 0199' },
        { label: 'Action Time', value: '2026-10-16 21:35:12 UTC' },
        { label: 'Savings Balance at Risk', value: '$24,300.00' },
      ],
      recommendedNextStep:
        'Immediately suspend web & mobile session tokens, trigger identity verification challenge (Passport selfie) before releasing credentials.',
    },
    toolTrace: [
      {
        step: 1,
        tool: 'audit_credential_history',
        args: { customerId: 'CUST-77319', lookback: '3h' },
        result: { mfaChanged: true, changedChannel: 'web_portal_password_reset', voipDetected: true },
        timestamp: '2026-10-16T21:41:00Z',
      },
    ],
    draftReply:
      'Dear Customer,\n\nWe have initiated an emergency lockdown on your account credentials and suspended all active login sessions to protect your funds. Your savings account is currently safeguarded against outbound transfers.\n\nPlease follow the secure identity verification link sent to your registered postal address or call our priority security line.\n\nFintech Security Desk',
  },

  // 3. Moderate case: finished agent trace awaiting approval / review
  {
    id: 'CASE-8794',
    customerId: 'CUST-55120',
    receivedAt: '2026-10-16T19:30:00Z',
    tier: 'moderate',
    status: 'awaiting_approval',
    unknownCategory: false,
    complaintText:
      'I tried to pay my electricity utility bill of $142.50 at the self-service terminal. The machine printed "TRANSACTION TIMED OUT / VOID", but when I checked my bank balance 5 minutes later, $142.50 was deducted from my checking balance! The utility company says they never received it.',
    categories: [
      {
        categoryId: 'failed_payment_money_deducted',
        categoryName: 'Failed Payment Money Deducted',
        confidence: 0.95,
        supportingQuote: 'machine printed "TRANSACTION TIMED OUT / VOID", but ... $142.50 was deducted',
      },
    ],
    report: {
      summary:
        'Gateway reconciliation timeout confirmed. Acquirer terminal dropped connection after ISO-8583 authorization stage before capture confirmation. Merchant settlement file indicates zero-capture.',
      likelyCauses: ['Network latency drop on utility terminal POS', 'Interrupted TCP handshake during debit capture'],
      policyRefs: ['EFT Dispute Rule 12.4 (Uncaptured POS Deductions)', 'Standard Reversal Window (24h)'],
      evidence: [
        { label: 'Auth Code', value: 'AUTH_883011' },
        { label: 'Terminal State', value: 'Timeout / Voided' },
        { label: 'Deducted Sum', value: '$142.50' },
        { label: 'Merchant Acquirer', value: 'National Grid POS Network' },
        { label: 'Ledger Hold', value: 'Soft Hold (Reversible)' },
      ],
      recommendedNextStep:
        'Issue immediate automated credit adjustment of $142.50 and release pending pre-authorization hold.',
    },
    toolTrace: [
      {
        step: 1,
        tool: 'query_pos_acquirer_log',
        args: { authCode: 'AUTH_883011', terminalId: 'TERM-NG-04' },
        result: { status: 'TERMINAL_TIMEOUT', captured: false, settlementRecorded: false },
        timestamp: '2026-10-16T19:31:05Z',
      },
      {
        step: 2,
        tool: 'verify_account_hold',
        args: { customerId: 'CUST-55120', amount: 142.5 },
        result: { holdType: 'unsettled_preauth', eligibleForInstantRelease: true },
        timestamp: '2026-10-16T19:31:40Z',
      },
      {
        step: 3,
        tool: 'draft_credit_memo',
        args: { customerId: 'CUST-55120', amount: 142.5, reason: 'terminal_timeout_void' },
        result: { creditMemoId: 'MEMO-99014', readyForExecution: true },
        timestamp: '2026-10-16T19:32:15Z',
      },
    ],
    proposedAction: {
      type: 'issue_refund',
      details: {
        refundAmount: 142.5,
        targetAccount: 'Checking ending in 8912',
        memoId: 'MEMO-99014',
        rationale: 'Verified terminal void with uncaptured merchant settlement',
      },
      requiresApproval: true,
    },
    draftReply:
      'Dear Customer,\n\nWe investigated the transaction at National Grid terminal. Our audit confirmed the POS connection timed out after debit reservation without completing payment capture. We have prepared an immediate reversal of $142.50 back into your checking account.\n\nThank you for banking with us.',
  },

  // 4. Moderate case: new in moderate queue (ready for "Investigate myself" or "Delegate to AI agent")
  {
    id: 'CASE-8772',
    customerId: 'CUST-33109',
    receivedAt: '2026-10-16T20:10:00Z',
    tier: 'moderate',
    status: 'awaiting_human',
    unknownCategory: false,
    complaintText:
      'I accidentally sent $350 to my old landlord instead of my sister because their names both started with "Sarah" in my recent payees list. Can you pull the money back or reverse the transfer? The landlord has not replied to my messages.',
    categories: [
      {
        categoryId: 'wrong_recipient_transfer',
        categoryName: 'Wrong Recipient Transfer',
        confidence: 0.93,
        supportingQuote: 'accidentally sent $350 to my old landlord instead of my sister',
      },
    ],
    report: {
      summary:
        'Customer executed authorized P2P transfer with mistaken beneficiary designation. Destination account is internal bank client with positive balance.',
      likelyCauses: ['Payee autocomplete misselection by customer'],
      policyRefs: ['Contingent Reimbursement Model (CRM) Code - Misdirected Payments Protocol'],
      evidence: [
        { label: 'Transfer Amount', value: '$350.00' },
        { label: 'Transfer Timestamp', value: '2026-10-16 19:45:00 UTC' },
        { label: 'Recipient Account', value: 'Internal Customer #CUST-10492' },
        { label: 'Recipient Balance', value: '$1,290.40 (Sufficient for recall)' },
      ],
      recommendedNextStep:
        'Dispatch formal beneficiary recall request notice and initiate inter-customer clawback hold under Section 14.',
    },
    toolTrace: [],
    draftReply:
      'Dear Customer,\n\nWe understand that you transferred $350 to an unintended recipient. Because the recipient also holds an account with us, we can initiate a formal beneficiary contact and misdirected payment recall process.',
  },

  // 5. Moderate case: delayed transfer
  {
    id: 'CASE-8760',
    customerId: 'CUST-61244',
    receivedAt: '2026-10-16T18:05:00Z',
    tier: 'moderate',
    status: 'awaiting_human',
    unknownCategory: false,
    complaintText:
      'My international wire of 1,200 EUR to my university tuition office was initiated 4 days ago and is still marked "Processing". The payment deadline is tomorrow! Please expedite this wire or tell me where the hold is.',
    categories: [
      {
        categoryId: 'delayed_or_pending_transfer',
        categoryName: 'Delayed or Pending Transfer',
        confidence: 0.91,
        supportingQuote: 'international wire of 1,200 EUR ... initiated 4 days ago and is still marked "Processing"',
      },
    ],
    report: {
      summary:
        'SWIFT gpi tracking shows transfer halted at intermediary correspondent bank (Deutsche Bank Frankfurt) for sanction list fuzzy name screening on beneficiary university.',
      likelyCauses: ['Correspondent bank compliance AML name collision'],
      policyRefs: ['International Wire SLA & Sanctions Screening Annex C'],
      evidence: [
        { label: 'Wire Reference', value: 'SWIFT-DE-8891024' },
        { label: 'Amount', value: '1,200.00 EUR' },
        { label: 'Correspondent Status', value: 'HELD_COMPLIANCE_REVIEW' },
        { label: 'Expected Release', value: 'Within 6 hours upon automated whitelist match' },
      ],
      recommendedNextStep:
        'Provide SWIFT UETR tracking code to student and dispatch priority clearance ping to correspondent desk.',
    },
    toolTrace: [],
    draftReply:
      'Dear Customer,\n\nWe located your wire (UETR: 8891024-DE). It is currently clearing standard automated regulatory screening at our correspondent partner in Frankfurt. We have submitted a priority clearance ping to expedite settlement for your university deadline.',
  },

  // 6. Unknown Category Case 1
  {
    id: 'CASE-8755',
    customerId: 'CUST-40912',
    receivedAt: '2026-10-16T17:45:00Z',
    tier: 'moderate',
    status: 'awaiting_human',
    unknownCategory: true,
    complaintText:
      'Your AI budgeting assistant "AutoSave Wizard" made a smart calculation error. It automatically deducted $80 from my main account claiming it was spare change from coffee purchases, but I only bought a single $3.50 latte! It wiped out my metro transit budget.',
    categories: [
      {
        categoryId: 'unknown',
        categoryName: 'Uncategorized Algorithm / Feature Error',
        confidence: 0.35,
        supportingQuote: 'AI budgeting assistant "AutoSave Wizard" made a smart calculation error',
      },
    ],
    report: {
      summary:
        'Complaint involves AI Automated Micro-Saving algorithm logic failure. No existing category directly covers algorithmic micro-savings round-up miscalculations.',
      likelyCauses: ['Round-up multiplier bug in AutoSave v2.3 beta plugin'],
      policyRefs: ['Algorithmic Features Terms of Use Sec 3'],
      evidence: [
        { label: 'Trigger Transaction', value: '$3.50 Coffee' },
        { label: 'Calculated Round-up', value: '$80.00 (Expected: $0.50)' },
        { label: 'Target Vault', value: 'Holiday Savings Vault' },
      ],
      recommendedNextStep:
        'Human operator must map this complaint to an existing category or create a new category (e.g. "Automated Savings / Bot Feature Error") with Moderate tier.',
    },
    toolTrace: [],
    draftReply:
      'Dear Customer,\n\nWe apologize for the calculation discrepancy in your AutoSave round-up. We are reviewing the rule engine and can return the $80 from your vault back into your primary transit checking immediately.',
  },

  // 7. Unknown Category Case 2
  {
    id: 'CASE-8748',
    customerId: 'CUST-88391',
    receivedAt: '2026-10-16T16:12:00Z',
    tier: 'low',
    status: 'awaiting_human',
    unknownCategory: true,
    complaintText:
      'I am an ESG investor and signed up for your "Green Debit Card" that promised a tree would be planted for every 10 transactions. Where is my digital tree planting certificate? Your mobile impact tracker has been stuck on zero trees for 3 months!',
    categories: [
      {
        categoryId: 'unknown',
        categoryName: 'Uncategorized Partner ESG Perk',
        confidence: 0.28,
        supportingQuote: 'promised a tree would be planted for every 10 transactions... impact tracker stuck on zero',
      },
    ],
    report: {
      summary:
        'Customer querying loyalty/ESG partnership benefit fulfillment (digital tree planting certificate). Unmatched by current primary financial operations taxonomy.',
      likelyCauses: ['Third-party API synchronization lag with NGO partner Eden Reforestation'],
      policyRefs: ['Green Card Tier Rewards Schedule'],
      evidence: [
        { label: 'Card Tier', value: 'Green Debit Tier' },
        { label: 'Eligible Swipes', value: '47 Transactions (4 Trees Qualified)' },
        { label: 'Partner Status', value: 'Batch Pending sync' },
      ],
      recommendedNextStep:
        'Categorize as Loyalty/Partner Rewards or create new category "Loyalty & ESG Perk Inquiries" (Low tier).',
    },
    toolTrace: [],
    draftReply:
      'Dear Customer,\n\nThank you for choosing our Green Debit program! Your 47 transactions have qualified for 4 trees. We are currently refreshing the partner certificate sync and your digital badge will display in the app within 24 hours.',
  },

  // 8. Low Tier Auto-replied 1
  {
    id: 'CASE-8730',
    customerId: 'CUST-19203',
    receivedAt: '2026-10-16T15:20:00Z',
    tier: 'low',
    status: 'auto_replied',
    unknownCategory: false,
    complaintText:
      'Face ID login keeps failing on my iPhone 15 after the latest iOS update. I have to type my 6-digit passcode every single time which is annoying.',
    categories: [
      {
        categoryId: 'app_or_login_issue',
        categoryName: 'App or Login Issue',
        confidence: 0.94,
        supportingQuote: 'Face ID login keeps failing on my iPhone 15',
      },
    ],
    report: {
      summary: 'Biometric authorization fallback to passcode triggered due to iOS keychain cache refresh.',
      likelyCauses: ['iOS 18 biometric token re-authentication requirement'],
      policyRefs: ['App Biometric Security Guidelines'],
      evidence: [
        { label: 'Client Device', value: 'iPhone 15 Pro / iOS 18.1' },
        { label: 'Auth Status', value: 'Passcode Fallback Successful' },
      ],
      recommendedNextStep: 'Advise customer to re-toggle Face ID in App Settings > Security.',
    },
    toolTrace: [],
    proposedAction: { type: 'reply_only', details: 'Auto-reply dispatched via standard template', requiresApproval: false },
    draftReply:
      'Hello! To restore Face ID functionality after an iOS upgrade, please open the FinTech App > Settings > Security & Biometrics, toggle Face ID off and back on. If prompted, confirm with your phone passcode.',
  },

  // 9. Low Tier Auto-replied 2
  {
    id: 'CASE-8725',
    customerId: 'CUST-98301',
    receivedAt: '2026-10-16T14:40:00Z',
    tier: 'low',
    status: 'auto_replied',
    unknownCategory: false,
    complaintText:
      'Why did I get charged a $3.00 fee at the local ATM on 5th avenue? I thought all domestic ATM withdrawals were free with my tier.',
    categories: [
      {
        categoryId: 'fees_and_charges_question',
        categoryName: 'Fees and Charges Question',
        confidence: 0.96,
        supportingQuote: 'Why did I get charged a $3.00 fee at the local ATM',
      },
    ],
    report: {
      summary:
        'Customer incurred out-of-network surcharge from an independent ATM operator (Cardtronics). Standard plan covers in-network Allpoint ATMs without fee.',
      likelyCauses: ['Independent ATM operator surcharge outside Allpoint network'],
      policyRefs: ['Personal Account Fee Schedule Sec 2.1'],
      evidence: [
        { label: 'ATM Location', value: 'Cardtronics Bodega ATM #14' },
        { label: 'Fee Charged', value: '$3.00 (Operator fee)' },
        { label: 'Plan In-Network ATM count', value: '55,000 Free Allpoint locations' },
      ],
      recommendedNextStep: 'Provide explanation and link to in-app ATM locator map.',
    },
    toolTrace: [],
    proposedAction: { type: 'reply_only', details: 'Automated fee explanation sent', requiresApproval: false },
    draftReply:
      'Hi there! Your account includes unlimited free withdrawals at over 55,000 Allpoint ATMs. The $3.00 fee was charged directly by the independent terminal operator. Use our in-app ATM locator to find fee-free machines near you!',
  },

  // 10. Low Tier Auto-replied 3
  {
    id: 'CASE-8718',
    customerId: 'CUST-22941',
    receivedAt: '2026-10-16T13:15:00Z',
    tier: 'low',
    status: 'auto_replied',
    unknownCategory: false,
    complaintText:
      'I really dislike the new dark mode color contrast. The grey text on black background is very difficult to read in bright sunlight. Please give us the option to revert to pure white background.',
    categories: [
      {
        categoryId: 'general_frustration_or_feedback',
        categoryName: 'General Frustration / Feedback',
        confidence: 0.92,
        supportingQuote: 'grey text on black background is very difficult to read in bright sunlight',
      },
    ],
    report: {
      summary: 'Product UX sentiment report regarding accessibility and WCAG contrast in Mobile Theme v4.',
      likelyCauses: ['User accessibility preference on display theme'],
      policyRefs: ['Accessibility Standard Guidelines WCAG 2.1 AA'],
      evidence: [
        { label: 'Selected Theme', value: 'OLED Dark' },
        { label: 'Feedback Tag', value: 'Theme Accessibility' },
      ],
      recommendedNextStep: 'Acknowledge sentiment and forward to Mobile Design backlog.',
    },
    toolTrace: [],
    proposedAction: { type: 'reply_only', details: 'Feedback acknowledgment sent', requiresApproval: false },
    draftReply:
      'Thank you for sharing your feedback on our new dark mode! We take visual accessibility seriously and our design team is currently developing high-contrast toggle options for our next release.',
  },

  // 11. Low Tier Auto-replied 4
  {
    id: 'CASE-8711',
    customerId: 'CUST-77402',
    receivedAt: '2026-10-16T11:00:00Z',
    tier: 'low',
    status: 'auto_replied',
    unknownCategory: false,
    complaintText:
      'How much foreign exchange fee do you charge when using my debit card in Japan? Traveling next week and need to know.',
    categories: [
      {
        categoryId: 'fees_and_charges_question',
        categoryName: 'Fees and Charges Question',
        confidence: 0.97,
        supportingQuote: 'How much foreign exchange fee do you charge when using my debit card in Japan',
      },
    ],
    report: {
      summary: 'Pre-travel foreign exchange inquiry regarding JPY transaction markups.',
      likelyCauses: ['International travel preparation'],
      policyRefs: ['Mastercard FX Wholesale Rates & Zero Markup Policy'],
      evidence: [
        { label: 'Destination', value: 'Japan (JPY)' },
        { label: 'Bank FX Markup', value: '0.0% (Interbank wholesale rate)' },
      ],
      recommendedNextStep: 'Send zero-markup policy confirmation and international travel tip checklist.',
    },
    toolTrace: [],
    draftReply:
      'Safe travels! Your debit card features 0% foreign transaction fees abroad. Currency conversion to Japanese Yen (JPY) is processed at the live Mastercard interbank exchange rate with no hidden bank markup.',
  },

  // 12. Low Tier Auto-replied 5
  {
    id: 'CASE-8705',
    customerId: 'CUST-33819',
    receivedAt: '2026-10-16T09:30:00Z',
    tier: 'low',
    status: 'auto_replied',
    unknownCategory: false,
    complaintText:
      'Push notifications for my salary deposit did not pop up today, even though the money was in my account. I like getting the notification ding.',
    categories: [
      {
        categoryId: 'app_or_login_issue',
        categoryName: 'App or Login Issue',
        confidence: 0.89,
        supportingQuote: 'Push notifications for my salary deposit did not pop up today',
      },
    ],
    report: {
      summary: 'Push notification delivery delivery delay reported by APNS gateway.',
      likelyCauses: ['Apple APNS background battery throttling on low power mode'],
      policyRefs: ['Notification Service Delivery Standard'],
      evidence: [
        { label: 'Deposit Event', value: 'ACH Direct Deposit Completed' },
        { label: 'Push Status', value: 'Delivered (Delayed 14 mins by OS)' },
      ],
      recommendedNextStep: 'Send notification permissions guide.',
    },
    toolTrace: [],
    draftReply:
      'Hello! We verified that your deposit cleared successfully. If notifications are delayed, please check that "Low Power Mode" or "Focus / Do Not Disturb" is not suppressing instant alert banners on your phone.',
  },

  // 13. Critical Case: Stolen phone with unauthorized contactless spending
  {
    id: 'CASE-8690',
    customerId: 'CUST-99120',
    receivedAt: '2026-10-15T23:00:00Z',
    tier: 'critical',
    status: 'awaiting_human',
    unknownCategory: false,
    complaintText:
      'My phone was stolen while riding the subway yesterday. The thief managed to tap contactless payments at three convenience stores before I could borrow a computer to lock it. Total loss is $290. Need reimbursement and security audit.',
    categories: [
      {
        categoryId: 'lost_or_stolen_device',
        categoryName: 'Lost or Stolen Device',
        confidence: 0.96,
        supportingQuote: 'My phone was stolen while riding the subway yesterday... thief managed to tap contactless payments',
      },
      {
        categoryId: 'unauthorized_transaction',
        categoryName: 'Unauthorized Transaction',
        confidence: 0.88,
        supportingQuote: 'Total loss is $290. Need reimbursement',
      },
    ],
    report: {
      summary:
        'Physical device theft with subsequent offline/express transit contactless taps. Tokenized Apple Pay device was delinked via web portal 45 minutes after first tap.',
      likelyCauses: ['Stolen device with Apple Express Transit contactless enabled'],
      policyRefs: ['Regulation E (12 CFR Part 1005) - Lost/Stolen Access Device'],
      evidence: [
        { label: 'Reported Theft', value: 'Subway Line 4' },
        { label: 'Card Token', value: 'Apple Pay Device Token #8812' },
        { label: 'Disputed Charges', value: '$290.00 (3 transactions)' },
        { label: 'Token Status', value: 'Revoked by Customer' },
      ],
      recommendedNextStep:
        'Investigate contactless tap timestamps against token revocation and file Reg E dispute for full reimbursement.',
    },
    toolTrace: [
      {
        step: 1,
        tool: 'audit_token_lifecycle',
        args: { customerId: 'CUST-99120', token: 'TOKEN-8812' },
        result: { deviceDelinked: true, lastTap: '2026-10-15T22:10:00Z', delinkedAt: '2026-10-15T22:55:00Z' },
        timestamp: '2026-10-15T23:05:00Z',
      },
    ],
    draftReply:
      'Dear Customer,\n\nWe are sorry to hear about the theft of your device. We have confirmed your token #8812 has been completely revoked. Under Regulation E guidelines, our fraud operations team is reviewing the 3 unauthorized taps to issue provisional credit.',
  },

  // 14. Moderate case: Duplicate charge / merchant dispute
  {
    id: 'CASE-8681',
    customerId: 'CUST-44190',
    receivedAt: '2026-10-15T20:25:00Z',
    tier: 'moderate',
    status: 'delegated',
    unknownCategory: false,
    complaintText:
      'Delta Airlines charged my credit card twice for flight reservation #DL-9941. Two identical debits of $420.00 posted on the exact same second. I called Delta and was on hold for 2 hours with no resolution.',
    categories: [
      {
        categoryId: 'duplicate_charge_or_merchant_dispute',
        categoryName: 'Duplicate Charge / Merchant Dispute',
        confidence: 0.97,
        supportingQuote: 'Delta Airlines charged my credit card twice... Two identical debits of $420.00 posted on the exact same second',
      },
    ],
    report: {
      summary:
        'Confirmed duplicate acquirer authorization payload. Same RRN (Retrieval Reference Number) submitted twice under identical merchant ticket ID.',
      likelyCauses: ['Merchant gateway idempotency key collision'],
      policyRefs: ['Mastercard Chargeback Reason Code 4834 (Duplicate Processing)'],
      evidence: [
        { label: 'Merchant', value: 'Delta Air Lines' },
        { label: 'Charge 1', value: '$420.00 (Auth 099112)' },
        { label: 'Charge 2', value: '$420.00 (Auth 099113 Duplicate)' },
        { label: 'Time Diff', value: '0.08 seconds' },
      ],
      recommendedNextStep:
        'Run automated agent chargeback dispute filing under Reason Code 4834 for second charge.',
    },
    toolTrace: [
      {
        step: 1,
        tool: 'check_idempotency_logs',
        args: { merchant: 'Delta Air Lines', amount: 420.0 },
        result: { duplicateIdentified: true, ticketId: 'DL-9941', duplicateAuth: '099113' },
        timestamp: '2026-10-15T20:30:00Z',
      },
    ],
    draftReply:
      'Dear Customer,\n\nOur system detected an exact duplicate processing charge of $420.00 from Delta Airlines occurring within 80 milliseconds of your original authorization. We have filed an automated dispute (Mastercard Code 4834) to reverse the secondary duplicate charge.',
  },
]

let casesStore: Case[] = [...INITIAL_CASES]

export const INITIAL_DECISIONS: Decision[] = [
  {
    id: 'DEC-1001',
    caseId: 'CASE-8705',
    actor: 'ai',
    action: 'auto_reply_sent',
    payload: { template: 'low_tier_push_notifications', queue: 'low_auto' },
    evidence: 'High confidence match (0.89) on app_or_login_issue with standard resolution template.',
    model: 'Fintech-Triage-Mini-v2',
    createdAt: '2026-10-16T09:30:15Z',
  },
  {
    id: 'DEC-1002',
    caseId: 'CASE-8711',
    actor: 'ai',
    action: 'auto_reply_sent',
    payload: { template: 'low_tier_fx_inquiry', queue: 'low_auto' },
    evidence: 'Confidence 0.97 on fees_and_charges_question. Standard travel FAQ match.',
    model: 'Fintech-Triage-Mini-v2',
    createdAt: '2026-10-16T11:00:10Z',
  },
  {
    id: 'DEC-1003',
    caseId: 'CASE-8681',
    actor: 'human',
    action: 'delegate',
    payload: { assignedAgent: 'Agent-Dispute-Resolver-v1' },
    evidence: 'Human operator Sarah reviewed duplicate charge summary and delegated to automated dispute agent.',
    model: 'Human Reviewer (Sarah Jenkins)',
    createdAt: '2026-10-15T20:28:00Z',
  },
  {
    id: 'DEC-1004',
    caseId: 'CASE-8794',
    actor: 'ai',
    action: 'propose_refund',
    payload: { amount: 142.5, requiresApproval: true, memoId: 'MEMO-99014' },
    evidence: 'POS terminal timeout verified with zero settlement capture.',
    model: 'Fintech-Reasoning-Agent-Pro',
    createdAt: '2026-10-16T19:32:20Z',
  },
  {
    id: 'DEC-1005',
    caseId: 'CASE-8821',
    actor: 'ai',
    action: 'propose_freeze',
    payload: { amount: 4850.0, merchant: 'ApexCrypto Global', requiresApproval: true },
    evidence: 'Tor exit node IP matched against international crypto merchant debit.',
    model: 'Fintech-Reasoning-Agent-Pro',
    createdAt: '2026-10-16T22:16:50Z',
  },
]

let decisionsStore: Decision[] = [...INITIAL_DECISIONS]

export const INITIAL_AUDIT_SAMPLES: LowTierAuditItem[] = [
  {
    id: 'AUDIT-01',
    caseId: 'CASE-8730',
    customerId: 'CUST-19203',
    complaintText: 'Face ID login keeps failing on my iPhone 15 after the latest iOS update. I have to type my 6-digit passcode every single time which is annoying.',
    sentReply: 'Hello! To restore Face ID functionality after an iOS upgrade, please open the FinTech App > Settings > Security & Biometrics, toggle Face ID off and back on. If prompted, confirm with your phone passcode.',
    sentAt: '2026-10-16T15:20:10Z',
    category: 'App or Login Issue',
    auditStatus: 'pending',
  },
  {
    id: 'AUDIT-02',
    caseId: 'CASE-8725',
    customerId: 'CUST-98301',
    complaintText: 'Why did I get charged a $3.00 fee at the local ATM on 5th avenue? I thought all domestic ATM withdrawals were free with my tier.',
    sentReply: 'Hi there! Your account includes unlimited free withdrawals at over 55,000 Allpoint ATMs. The $3.00 fee was charged directly by the independent terminal operator. Use our in-app ATM locator to find fee-free machines near you!',
    sentAt: '2026-10-16T14:40:15Z',
    category: 'Fees and Charges Question',
    auditStatus: 'verified_fine',
    auditedBy: 'Reviewer Sarah J.',
    auditedAt: '2026-10-16T16:00:00Z',
  },
  {
    id: 'AUDIT-03',
    caseId: 'CASE-8718',
    customerId: 'CUST-22941',
    complaintText: 'I really dislike the new dark mode color contrast. The grey text on black background is very difficult to read in bright sunlight. Please give us the option to revert to pure white background.',
    sentReply: 'Thank you for sharing your feedback on our new dark mode! We take visual accessibility seriously and our design team is currently developing high-contrast toggle options for our next release.',
    sentAt: '2026-10-16T13:15:08Z',
    category: 'General Frustration / Feedback',
    auditStatus: 'pending',
  },
  {
    id: 'AUDIT-04',
    caseId: 'CASE-8711',
    customerId: 'CUST-77402',
    complaintText: 'How much foreign exchange fee do you charge when using my debit card in Japan? Traveling next week and need to know.',
    sentReply: 'Safe travels! Your debit card features 0% foreign transaction fees abroad. Currency conversion to Japanese Yen (JPY) is processed at the live Mastercard interbank exchange rate with no hidden bank markup.',
    sentAt: '2026-10-16T11:00:10Z',
    category: 'Fees and Charges Question',
    auditStatus: 'verified_fine',
    auditedBy: 'Reviewer Marcus L.',
    auditedAt: '2026-10-16T11:45:00Z',
  },
  {
    id: 'AUDIT-05',
    caseId: 'CASE-8705',
    customerId: 'CUST-33819',
    complaintText: 'Push notifications for my salary deposit did not pop up today, even though the money was in my account. I like getting the notification ding.',
    sentReply: 'Hello! We verified that your deposit cleared successfully. If notifications are delayed, please check that "Low Power Mode" or "Focus / Do Not Disturb" is not suppressing instant alert banners on your phone.',
    sentAt: '2026-10-16T09:30:15Z',
    category: 'App or Login Issue',
    auditStatus: 'pending',
  },
]

let auditSamplesStore: LowTierAuditItem[] = [...INITIAL_AUDIT_SAMPLES]

export let metricsStore: Metrics = {
  criticalRecall: 99.4,
  categoryAccuracy: 94.2,
  unknownRoutingRate: 3.8,
  costSavingPct: 68.5,
  overEscalationRate: 4.1,
  tierCounts: {
    critical: 4,
    moderate: 5,
    low: 5,
    unknown: 2,
  },
}

// In-Memory Operations
export const mockApi = {
  // Categories
  getCategories: async (): Promise<Category[]> => {
    return [...categoriesStore]
  },

  createCategory: async (category: Omit<Category, 'source'>): Promise<Category> => {
    const existing = categoriesStore.find((c) => c.id === category.id)
    if (existing) return existing
    const newCat: Category = {
      ...category,
      source: 'human_added',
    }
    categoriesStore = [newCat, ...categoriesStore]
    return newCat
  },

  // Cases
  getCases: async (tier?: Tier | 'unknown', status?: string): Promise<Case[]> => {
    return casesStore.filter((c) => {
      if (tier === 'unknown') {
        if (!c.unknownCategory) return false
      } else if (tier && c.tier !== tier) {
        return false
      }
      if (status && c.status !== status) {
        return false
      }
      return true
    })
  },

  getCaseById: async (id: string): Promise<Case | null> => {
    const found = casesStore.find((c) => c.id === id)
    return found ? { ...found } : null
  },

  submitComplaint: async (payload: SubmitComplaintPayload): Promise<SubmitComplaintResponse> => {
    const textLower = payload.complaintText.toLowerCase()

    // Determine category match from keywords
    let matchedId = 'unknown'
    let matchedConfidence = 0.4
    let quote = payload.complaintText.slice(0, 75) + '...'
    let tier: Tier = 'moderate'
    let isUnknown = false

    if (
      textLower.includes('unauthorized') ||
      textLower.includes('fraud') ||
      textLower.includes('stole') ||
      textLower.includes('hacked') ||
      textLower.includes('freeze')
    ) {
      if (textLower.includes('phone') || textLower.includes('device') || textLower.includes('subway')) {
        matchedId = 'lost_or_stolen_device'
        matchedConfidence = 0.94
        tier = 'critical'
      } else if (textLower.includes('password') || textLower.includes('2fa') || textLower.includes('locked out')) {
        matchedId = 'account_takeover'
        matchedConfidence = 0.97
        tier = 'critical'
      } else {
        matchedId = 'unauthorized_transaction'
        matchedConfidence = 0.96
        tier = 'critical'
      }
    } else if (
      textLower.includes('wrong recipient') ||
      textLower.includes('sent to wrong') ||
      textLower.includes('accidental transfer')
    ) {
      matchedId = 'wrong_recipient_transfer'
      matchedConfidence = 0.92
      tier = 'moderate'
    } else if (
      textLower.includes('timed out') ||
      textLower.includes('failed payment') ||
      textLower.includes('deducted') ||
      textLower.includes('money taken')
    ) {
      matchedId = 'failed_payment_money_deducted'
      matchedConfidence = 0.93
      tier = 'moderate'
    } else if (
      textLower.includes('delayed') ||
      textLower.includes('pending') ||
      textLower.includes('wire') ||
      textLower.includes('not arrived')
    ) {
      matchedId = 'delayed_or_pending_transfer'
      matchedConfidence = 0.91
      tier = 'moderate'
    } else if (
      textLower.includes('double') ||
      textLower.includes('twice') ||
      textLower.includes('duplicate') ||
      textLower.includes('merchant dispute')
    ) {
      matchedId = 'duplicate_charge_or_merchant_dispute'
      matchedConfidence = 0.95
      tier = 'moderate'
    } else if (textLower.includes('face id') || textLower.includes('login') || textLower.includes('app crash') || textLower.includes('password reset')) {
      matchedId = 'app_or_login_issue'
      matchedConfidence = 0.95
      tier = 'low'
    } else if (textLower.includes('fee') || textLower.includes('charge') || textLower.includes('atm') || textLower.includes('exchange rate')) {
      matchedId = 'fees_and_charges_question'
      matchedConfidence = 0.93
      tier = 'low'
    } else if (textLower.includes('hate') || textLower.includes('dark mode') || textLower.includes('dislike') || textLower.includes('feedback') || textLower.includes('color')) {
      matchedId = 'general_frustration_or_feedback'
      matchedConfidence = 0.88
      tier = 'low'
    } else {
      isUnknown = true
      matchedId = 'unknown'
      matchedConfidence = 0.31
      tier = 'moderate'
    }

    const matchedCatObj = categoriesStore.find((c) => c.id === matchedId)
    const categoryName = matchedCatObj ? matchedCatObj.name : 'Uncategorized Claim'

    const newCaseId = `CASE-${Math.floor(1000 + Math.random() * 9000)}`
    let queueTarget = isUnknown
      ? 'Unknown Category Queue (/unknown)'
      : tier === 'critical'
      ? 'Critical Queue (/critical)'
      : tier === 'moderate'
      ? 'Moderate Queue (/moderate)'
      : 'Low-tier Automated Reply Queue (/low-audit)'

    const newCase: Case = {
      id: newCaseId,
      customerId: payload.customerId.trim() || 'CUST-GUEST',
      receivedAt: new Date().toISOString(),
      tier: tier,
      status: isUnknown ? 'awaiting_human' : tier === 'low' ? 'auto_replied' : 'new',
      unknownCategory: isUnknown,
      complaintText: payload.complaintText,
      categories: [
        {
          categoryId: matchedId,
          categoryName,
          confidence: matchedConfidence,
          supportingQuote: quote,
        },
      ],
      report: {
        summary: `Automated assessment conducted for incoming complaint. Classification confidence evaluated at ${(matchedConfidence * 100).toFixed(0)}%.`,
        likelyCauses: isUnknown
          ? ['Unrecognized complaint pattern requiring operator taxonomic mapping']
          : [`Pattern matched against ${categoryName} ruleset`],
        policyRefs: ['Fintech Core Operating Guidelines Section 4', 'Triage Policy 2026.1'],
        evidence: [
          { label: 'Classification Confidence', value: `${(matchedConfidence * 100).toFixed(1)}%` },
          { label: 'Assigned Category', value: categoryName },
          { label: 'Calculated Risk Tier', value: tier.toUpperCase() },
        ],
        recommendedNextStep: isUnknown
          ? 'Map this complaint to an existing category or create a new category in Unknown Queue.'
          : tier === 'critical'
          ? 'Human investigator must open case details to perform immediate investigation.'
          : tier === 'moderate'
          ? 'Review report summary in Moderate queue to either investigate directly or delegate to AI agent.'
          : 'Low-risk automated response generated and logged for random sampling audit.',
      },
      toolTrace: [
        {
          step: 1,
          tool: 'nlp_intent_classifier_v3',
          args: { textSnippet: payload.complaintText.slice(0, 100) },
          result: { primaryCategory: matchedId, confidence: matchedConfidence, riskTier: tier },
          timestamp: new Date().toISOString(),
        },
      ],
      draftReply:
        tier === 'low'
          ? `Hello! Thank you for reaching out to FinTech Support regarding your query. We have automatically resolved this issue or logged your feedback for our product updates.`
          : undefined,
    }

    casesStore = [newCase, ...casesStore]

    // If low tier, also create an audit item and log decision
    if (tier === 'low' && !isUnknown) {
      auditSamplesStore = [
        {
          id: `AUDIT-${Math.floor(100 + Math.random() * 900)}`,
          caseId: newCase.id,
          customerId: newCase.customerId,
          complaintText: newCase.complaintText,
          sentReply: newCase.draftReply || '',
          sentAt: new Date().toISOString(),
          category: categoryName,
          auditStatus: 'pending',
        },
        ...auditSamplesStore,
      ]

      decisionsStore = [
        {
          id: `DEC-${Math.floor(2000 + Math.random() * 8000)}`,
          caseId: newCase.id,
          actor: 'ai',
          action: 'auto_reply_sent',
          payload: { category: matchedId, confidence: matchedConfidence },
          evidence: `Auto-replied with low-risk response template.`,
          model: 'Fintech-Triage-Mini-v2',
          createdAt: new Date().toISOString(),
        },
        ...decisionsStore,
      ]
    }

    return {
      case: newCase,
      matchedCategories: newCase.categories,
      tier: tier,
      queue: queueTarget,
      unknownCategory: isUnknown,
    }
  },

  // Decisions
  recordDecision: async (
    caseId: string,
    action: 'approve' | 'reject' | 'investigate' | 'delegate' | 'map_category' | 'create_category',
    payload?: any
  ): Promise<Case> => {
    const caseIndex = casesStore.findIndex((c) => c.id === caseId)
    if (caseIndex === -1) throw new Error(`Case ${caseId} not found`)

    const currentCase = { ...casesStore[caseIndex] }
    const now = new Date().toISOString()

    let newStatus = currentCase.status
    let evidenceText = `Action executed by human reviewer.`

    switch (action) {
      case 'approve':
        newStatus = 'resolved'
        evidenceText = `Approved proposed action: ${currentCase.proposedAction?.type || 'resolution'} by human reviewer.`
        break
      case 'reject':
        newStatus = 'awaiting_human'
        evidenceText = `Proposed agent resolution was rejected. Re-routed to manual desk.`
        break
      case 'investigate':
        newStatus = 'awaiting_human'
        evidenceText = `Human reviewer took ownership to investigate manually.`
        break
      case 'delegate':
        newStatus = 'agent_running'
        evidenceText = `Human reviewer delegated case to Autonomous Resolution Agent.`
        break
      case 'map_category':
        newStatus = 'new'
        currentCase.unknownCategory = false
        if (payload?.categoryId) {
          const cat = categoriesStore.find((c) => c.id === payload.categoryId)
          if (cat) {
            currentCase.tier = cat.tier
            currentCase.categories = [
              {
                categoryId: cat.id,
                categoryName: cat.name,
                confidence: 1.0,
                supportingQuote: 'Human mapped manually from Unknown queue',
              },
            ]
          }
        }
        evidenceText = `Case reclassified and mapped to category: ${payload?.categoryId}`
        break
      case 'create_category':
        newStatus = 'new'
        currentCase.unknownCategory = false
        if (payload?.category) {
          await mockApi.createCategory(payload.category)
          currentCase.tier = payload.category.tier
          currentCase.categories = [
            {
              categoryId: payload.category.id,
              categoryName: payload.category.name,
              confidence: 1.0,
              supportingQuote: 'Learned new category created by human reviewer',
            },
          ]
        }
        evidenceText = `Learned new category created: ${payload?.category?.name} [${payload?.category?.tier}]`
        break
    }

    currentCase.status = newStatus
    currentCase.lastUpdated = now
    casesStore[caseIndex] = currentCase

    // Append to decision audit log
    const newDecision: Decision = {
      id: `DEC-${Math.floor(2000 + Math.random() * 8000)}`,
      caseId: currentCase.id,
      actor: 'human',
      action,
      payload,
      evidence: evidenceText,
      model: 'Human Reviewer (Staff)',
      createdAt: now,
    }

    decisionsStore = [newDecision, ...decisionsStore]
    return currentCase
  },

  // Update draft reply
  updateDraftReply: async (caseId: string, reply: string): Promise<Case> => {
    const caseIndex = casesStore.findIndex((c) => c.id === caseId)
    if (caseIndex === -1) throw new Error(`Case ${caseId} not found`)
    casesStore[caseIndex].draftReply = reply
    return { ...casesStore[caseIndex] }
  },

  // Audit Logs
  getAuditLogs: async (actor?: 'human' | 'ai', query?: string): Promise<Decision[]> => {
    return decisionsStore.filter((d) => {
      if (actor && d.actor !== actor) return false
      if (query) {
        const q = query.toLowerCase()
        return (
          d.caseId.toLowerCase().includes(q) ||
          d.action.toLowerCase().includes(q) ||
          (d.evidence && String(d.evidence).toLowerCase().includes(q))
        )
      }
      return true
    })
  },

  // Low Tier Audit Samples
  getLowTierAuditSamples: async (): Promise<LowTierAuditItem[]> => {
    return [...auditSamplesStore]
  },

  reviewLowTierSample: async (sampleId: string, action: 'looks_fine' | 'escalate'): Promise<LowTierAuditItem> => {
    const idx = auditSamplesStore.findIndex((s) => s.id === sampleId)
    if (idx === -1) throw new Error(`Sample ${sampleId} not found`)

    const item = { ...auditSamplesStore[idx] }
    const now = new Date().toISOString()
    item.auditedAt = now
    item.auditedBy = 'Reviewer Staff'

    if (action === 'looks_fine') {
      item.auditStatus = 'verified_fine'
    } else {
      item.auditStatus = 'escalated'
      // Also update underlying case status
      const caseIdx = casesStore.findIndex((c) => c.id === item.caseId)
      if (caseIdx !== -1) {
        casesStore[caseIdx].tier = 'moderate'
        casesStore[caseIdx].status = 'awaiting_human'
      }
      // Record in audit log
      decisionsStore = [
        {
          id: `DEC-${Math.floor(2000 + Math.random() * 8000)}`,
          caseId: item.caseId,
          actor: 'human',
          action: 'audit_escalate_sample',
          payload: { reason: 'Incorrect auto-reply identified in low-tier sample audit' },
          evidence: `Staff escalated auto-replied case ${item.caseId} to Moderate queue.`,
          model: 'Staff Auditor',
          createdAt: now,
        },
        ...decisionsStore,
      ]
    }

    auditSamplesStore[idx] = item
    return item
  },

  // Metrics & Eval
  getMetrics: async (): Promise<Metrics> => {
    const criticalCount = casesStore.filter((c) => !c.unknownCategory && c.tier === 'critical').length
    const moderateCount = casesStore.filter((c) => !c.unknownCategory && c.tier === 'moderate').length
    const lowCount = casesStore.filter((c) => !c.unknownCategory && c.tier === 'low').length
    const unknownCount = casesStore.filter((c) => c.unknownCategory).length

    return {
      ...metricsStore,
      tierCounts: {
        critical: criticalCount,
        moderate: moderateCount,
        low: lowCount,
        unknown: unknownCount,
      },
    }
  },

  runEvaluation: async (): Promise<Metrics> => {
    // Generate slight realistic improvements when eval is run
    metricsStore = {
      criticalRecall: Math.min(99.9, +(metricsStore.criticalRecall + 0.1).toFixed(1)),
      categoryAccuracy: Math.min(98.5, +(metricsStore.categoryAccuracy + (Math.random() > 0.5 ? 0.3 : -0.1)).toFixed(1)),
      unknownRoutingRate: Math.max(1.8, +(metricsStore.unknownRoutingRate - 0.2).toFixed(1)),
      costSavingPct: Math.min(79.0, +(metricsStore.costSavingPct + 0.8).toFixed(1)),
      overEscalationRate: Math.max(2.1, +(metricsStore.overEscalationRate - 0.3).toFixed(1)),
      tierCounts: { ...metricsStore.tierCounts },
    }
    return mockApi.getMetrics()
  },
}
