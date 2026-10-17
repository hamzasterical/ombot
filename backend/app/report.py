import re

from sqlmodel import Session, select

from app import llm
from app.audit import log_decision
from app.config import settings
from app.models import Case, Category
from app.routing import usable_matches
from app.schemas import ClassificationResult, ReportResult
from app.tools import local_tools as tools

SYSTEM = """You write a structured case report for a bank officer about a customer complaint.
Put a short summary first: what happened, why it matters, and what the officer should decide.
Base likely causes and next steps on the provided policies and evidence only. Do not invent facts.
Cite transaction IDs, amounts, dates, devices and locations exactly as they appear in the evidence.
Compare activity against the customer's home city and primary device; security_events show logins,
new devices and credential changes. If the evidence does not show what the customer describes,
say that plainly instead of filling the gap.
Do not state a risk tier. Policy documents are generic samples."""

TXN_ID = re.compile(r"\bT\d{4}\b")
# "45,000", "$3,200", "$85.50", "150", "3500": amounts a customer quotes in a complaint
AMOUNT = re.compile(r"\$?\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d{3,7})\b")


def mentioned_amounts(text: str) -> list[float]:
    return [float(m.replace(",", "")) for m in AMOUNT.findall(text)]


def _payees(session: Session, txns: list[dict], limit: int = 8) -> list[dict]:
    """Everyone the customer sent money to in the history window, most recent first. Lets the report
    see who the customer usually pays even when those transfers are older than the latest ten."""
    by_account: dict[str, dict] = {}
    for t in txns:  # newest first
        acc = t["receiver_account"]
        if not acc:
            continue
        if acc not in by_account:
            owner = (tools.get_receiver(session, acc).get("customer") or {}).get("name")
            by_account[acc] = {"account": acc, "name": owner, "payments": 0,
                               "last_amount": t["amount"], "last_date": t["created_at"][:10]}  # fmt: skip
        by_account[acc]["payments"] += 1
    return list(by_account.values())[:limit]


def gather_evidence(session: Session, customer_id: str | None, complaint_text: str) -> dict:
    """Pull related records. Picks the transaction by an ID in the text, else by an amount the
    customer quotes, else the customer's latest transaction (and says so)."""
    evidence: dict = {}
    if not customer_id:
        return evidence
    history = tools.get_customer_history(session, customer_id)
    if "error" in history:
        return evidence
    evidence["customer_history"] = {
        **history,
        "transactions": history["transactions"][:10],
        "received_transactions": history["received_transactions"][:5],
    }
    if history["security_events"]:
        evidence["security_events"] = history["security_events"][:10]
    if payees := _payees(session, history["transactions"]):
        evidence["payees"] = payees

    mentioned = [tools.get_transaction(session, t) for t in TXN_ID.findall(complaint_text)]
    txn = next((t for t in mentioned if "error" not in t), None)
    if txn is None:
        amounts = mentioned_amounts(complaint_text)
        pool = history["transactions"] + history["received_transactions"]
        matches = [t for t in pool if any(abs(t["amount"] - a) < 0.005 for a in amounts)]
        if matches:
            matches.sort(key=lambda t: t["created_at"], reverse=True)
            txn = matches[0]
            if len(matches) > 1:
                evidence["matching_transactions"] = matches[:5]
            evidence["transaction_note"] = "Matched by the amount quoted in the complaint."
    if txn is None and history["transactions"]:
        txn = history["transactions"][0]
        evidence["transaction_note"] = (
            "No transaction ID or amount in the complaint; showing the customer's latest transaction, "
            "which may not be the one the complaint is about."
        )
    if txn:
        evidence["transaction"] = txn
        evidence["sender"] = tools.get_sender(session, txn["sender_account"])
        if txn["receiver_account"]:
            evidence["receiver"] = tools.get_receiver(session, txn["receiver_account"])
        if txn["merchant_id"]:
            evidence["merchant"] = tools.check_merchant(session, txn["merchant_id"])
    return evidence


def _policies_for(session: Session, classification: ClassificationResult, text: str) -> dict[str, str]:
    ids = [m.category_id for m in usable_matches(classification)]
    refs: list[str] = []
    for c in session.exec(select(Category).where(Category.id.in_(ids))).all():  # type: ignore[attr-defined]
        refs.extend(c.policy_refs or [])
    docs = {r: d for r in dict.fromkeys(refs) if (d := tools.get_policy(r))}
    if not docs:  # unknown category: best-effort keyword search
        docs = {p["policy_id"]: p["content"] for p in tools.search_policy(text, limit=2)}
    return docs


async def generate(
    session: Session,
    case: Case,
    complaint_text: str,
    classification: ClassificationResult,
    evidence: dict,
) -> ReportResult | None:
    """Generate and store the report. On failure the case is marked for a human."""
    policies = _policies_for(session, classification, complaint_text)
    matches = usable_matches(classification)
    user = (
        f"Complaint:\n{complaint_text}\n\n"
        f"Classified categories: {[m.model_dump() for m in matches] or 'none'}\n\n"
        f"Evidence (from database):\n{evidence}\n\n"
        "Policies:\n" + "\n\n".join(f"[{k}]\n{v}" for k, v in policies.items())
    )
    result = await llm.structured(settings.report_model, SYSTEM, user, ReportResult)

    if result.parsed is None:
        case.report = {"error": result.error, "summary": "Report generation failed; manual review needed."}
        case.status = "awaiting_human"
        report = None
    else:
        report = result.parsed
        report.evidence = evidence  # facts come from the DB, never from the LLM
        report.policy_references = list(policies) or report.policy_references
        case.report = report.model_dump()
    session.add(case)
    session.commit()

    log_decision(
        session,
        case.id,
        actor="system",
        action="generate_report",
        payload=case.report,
        evidence={"usage": result.usage, "latency_ms": result.latency_ms, "error": result.error},
        model=result.model,
    )
    return report
