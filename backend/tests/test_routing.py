from app.routing import (
    apply_danger_floor,
    assign_layer,
    determine_status,
    determine_tier,
    lookup_tier,
)
from app.schemas import CategoryMatch, ClassificationResult


def match(cid, conf=0.9, quote="q"):
    return CategoryMatch(category_id=cid, confidence=conf, supporting_quote=quote)


def test_highest_tier_wins(session):
    assert lookup_tier(session, ["app_or_login_issue", "unauthorized_transaction"]) == "critical"
    assert lookup_tier(session, ["app_or_login_issue", "wrong_recipient_transfer"]) == "moderate"
    assert lookup_tier(session, ["nope"]) is None


def test_no_match_is_unknown(session):
    assert determine_tier(session, ClassificationResult(), "my cat is sad") == "unknown"


def test_low_confidence_or_no_quote_is_unknown(session):
    low = ClassificationResult(categories=[match("app_or_login_issue", conf=0.3)])
    no_quote = ClassificationResult(categories=[match("app_or_login_issue", quote=" ")])
    assert determine_tier(session, low, "app broken") == "unknown"
    assert determine_tier(session, no_quote, "app broken") == "unknown"


def test_danger_floor_overrides_llm(session):
    low = ClassificationResult(categories=[match("app_or_login_issue")])
    assert determine_tier(session, low, "App is slow and I didn’t make this payment") == "critical"
    assert determine_tier(session, ClassificationResult(), "my account was hacked") == "critical"
    assert apply_danger_floor("fees question", "low") == "low"
    assert apply_danger_floor("this is not meant for you", "low") == "low"  # word boundary


def test_layer_and_status():
    assert [assign_layer(t) for t in ("critical", "moderate", "low", "unknown")] == [1, 2, 3, None]
    assert determine_status("low") == "auto_replied"
    assert {determine_status(t) for t in ("critical", "moderate", "unknown")} == {"awaiting_human"}
