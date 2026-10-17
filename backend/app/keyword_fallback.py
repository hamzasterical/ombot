"""Deterministic backup classifier, used only when the LLM call fails (rate limit, outage, bad output).

Without it, every complaint sent while the model is unavailable lands in the Unknown queue, even
"I was charged twice". Rules are conservative phrase patterns per seed category. Routing still takes the
highest tier among matches and still applies the danger floor, and the pipeline never auto-replies to a
keyword-classified case: a human always reviews it.
"""

import re

from app.config import settings
from app.schemas import CategoryMatch

FALLBACK_TAG = "keyword_fallback"  # ClassificationResult.raw_category when these rules produced the result

_RULES: dict[str, list[str]] = {
    "unauthorized_transaction": [
        r"(didn't|did not|never) (make|made|authori[sz]e|authori[sz]ed|approve|approved)",
        r"unauthori[sz]ed",
        r"not authori[sz]ed",
        r"without my (permission|approval|consent|knowledge)",
        r"(don't|do not|didn't|did not) recogni[sz]e",
        r"fraud(ulent)?",
        r"not me",
    ],
    "account_takeover": [
        r"hacked",
        r"(someone|somebody) (else )?(changed|reset) my (password|pin|email|phone number)",
        r"my (password|pin|email) (was|has been|got) changed",
        r"(someone|somebody) (else )?(is )?(logged|logging) in",
        r"(someone|somebody) (else )?(has|got) access",
        r"account (was |has been |got )?(compromised|taken over)",
        r"sim swap\w*",
        r"gave (them |him |her |someone |a stranger |the caller )?my (otp|pin|password|code|verification code|login)",
        r"pretend(ing|ed)? to be (from )?(the|my) bank",
        r"phish\w*",
        r"scam\w*",
        r"settings (have|has|were|was|had) (been )?changed",
        r"(unknown|unrecogni[sz]ed|strange|suspicious|new) (login|log-in|sign-in|device)",
        r"login alerts?",
    ],
    "lost_or_stolen_device": [
        r"stolen",
        r"(lost|misplaced) my (phone|mobile|card|debit card|credit card|wallet|device)",
        r"(phone|mobile|card|wallet|device) (was|got|has been) (lost|stolen)",
        r"can't find my (card|phone|wallet)",
    ],
    "wrong_recipient_transfer": [
        r"wrong (account|person|recipient|number|iban|contact|payee|beneficiary)",
        r"sent .{0,60}by mistake",
        r"mistyped",
        r"typed the wrong",
        r"incorrect (account|recipient|iban)",
    ],
    "failed_payment_money_deducted": [
        r"(failed|declined|did not go through|didn't go through|unsuccessful).{0,80}(deducted|debited|charged|taken|balance)",
        r"(deducted|debited|charged|taken).{0,80}(failed|declined|did not go through|didn't go through|unsuccessful)",
        r"money (was |has been |got )?deducted",
    ],
    "delayed_or_pending_transfer": [
        r"pending",
        r"(still )?(hasn't|has not|haven't|have not|not yet|never) (arrived|received|reached|been received)",
        r"not received",
        r"delayed",
        r"taking (so |too )?long",
        r"where is my (money|transfer|payment)",
        r"stuck",
    ],
    "duplicate_charge_or_merchant_dispute": [
        r"charged (twice|two times|2 times|double)",
        r"double[- ]charged",
        r"billed twice",
        r"duplicate (charge|payment|transaction)",
        r"refund",
        r"merchant",
        r"dispute",
        r"still (being )?(billed|charged)",
    ],
    "app_or_login_issue": [
        r"app (keeps )?(crash\w*|freez\w*|not working|won't open|doesn't open|is slow|is down)",
        r"(can't|cannot|can not|unable to) (log ?in|sign ?in|access the app|open the app)",
        r"log ?in (issue|problem|error)",
        r"forgot my (password|pin)",
        r"otp",
        r"verification code",
        r"app",
    ],
    "fees_and_charges_question": [
        r"fees?",
        r"service charge",
        r"(monthly|annual|maintenance) charge",
        r"interest rate",
        r"(daily |transfer |withdrawal )?limit",
        r"why (was|am) i (being )?charged",
    ],
    "general_frustration_or_feedback": [
        r"feedback",
        r"suggest\w*",
        r"feature",
        r"wait(ing)? times?",
        r"customer service",
        r"rude",
        r"annoy\w*",
        r"frustrat\w*",
        r"terrible service",
        r"please add",
    ],
}

_COMPILED = {cid: [re.compile(rf"\b(?:{p})\b") for p in pats] for cid, pats in _RULES.items()}


def _normalize(text: str) -> str:
    return text.lower().replace("’", "'").replace("‘", "'")


def match(complaint_text: str, known_ids: set[str]) -> list[CategoryMatch]:
    """Registry categories whose rules fire, each quoting the matched words from the complaint."""
    norm = _normalize(complaint_text)
    same_length = len(norm) == len(complaint_text)  # true for ordinary text: quotes keep the customer's casing
    out: list[CategoryMatch] = []
    for cid, patterns in _COMPILED.items():
        if cid not in known_ids:
            continue
        for p in patterns:
            if m := p.search(norm):
                quote = complaint_text[m.start() : m.end()] if same_length else m.group(0)
                # Exactly at the threshold so routing can use it; never presented as more certain than that.
                out.append(
                    CategoryMatch(category_id=cid, confidence=settings.confidence_threshold, supporting_quote=quote)
                )
                break
    return out
