from datetime import UTC, datetime

from sqlmodel import JSON, Column, Field, SQLModel


def _now() -> datetime:
    return datetime.now(UTC)


class Customer(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    phone: str = ""
    email: str = ""
    city: str = ""  # home city; activity elsewhere is an anomaly signal
    primary_device_id: str = ""  # the customer's usual phone/app device
    segment: str = "retail"  # retail | premier | business
    created_at: datetime = Field(default_factory=_now)


class Account(SQLModel, table=True):
    id: str = Field(primary_key=True)
    customer_id: str = Field(foreign_key="customer.id")
    balance: float = 0
    status: str = "active"  # active | frozen
    type: str = "checking"  # checking | savings | external (held at another bank)
    currency: str = "USD"


class Card(SQLModel, table=True):
    id: str = Field(primary_key=True)
    account_id: str = Field(foreign_key="account.id")
    kind: str = "debit"  # debit | credit
    last4: str = ""
    status: str = "active"  # active | blocked


class Merchant(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    complaint_count: int = 0
    category: str = ""  # e.g. online_retail, restaurant, utility, gaming, bank_fee
    city: str = ""
    country: str = ""


class Transaction(SQLModel, table=True):
    id: str = Field(primary_key=True)
    sender_account: str = Field(foreign_key="account.id")
    receiver_account: str | None = Field(default=None, foreign_key="account.id")
    amount: float
    merchant_id: str | None = Field(default=None, foreign_key="merchant.id")
    channel: str = ""
    device_id: str = ""
    created_at: datetime = Field(default_factory=_now)
    status: str = "completed"  # completed | pending | failed | reversed | frozen
    description: str = ""  # statement text, e.g. "Rent October to J. Alvarez"
    location: str = ""  # city/country where it was initiated
    failure_reason: str = ""  # why it is failed/pending, e.g. "switch timeout after debit"


class SecurityEvent(SQLModel, table=True):
    """Login, credential and device events: the evidence for takeover and lost-device cases."""

    id: int | None = Field(default=None, primary_key=True)
    customer_id: str = Field(foreign_key="customer.id")
    event_type: str  # login | login_new_device | login_failed | password_changed | ...
    device_id: str = ""
    location: str = ""
    detail: str = ""
    created_at: datetime = Field(default_factory=_now)


class Category(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    tier: str  # critical | moderate | low
    description: str = ""
    examples: list = Field(default_factory=list, sa_column=Column(JSON))
    causes: list = Field(default_factory=list, sa_column=Column(JSON))
    policy_refs: list = Field(default_factory=list, sa_column=Column(JSON))
    source: str = "seed"  # seed | human_added


class Complaint(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    customer_id: str | None = Field(default=None, foreign_key="customer.id")
    text: str
    received_at: datetime = Field(default_factory=_now)
    true_category: str | None = None  # synthetic test set only
    true_tier: str | None = None


class Case(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    complaint_id: int = Field(foreign_key="complaint.id")
    categories: list = Field(default_factory=list, sa_column=Column(JSON))
    confidence: dict = Field(default_factory=dict, sa_column=Column(JSON))
    quotes: dict = Field(default_factory=dict, sa_column=Column(JSON))
    tier: str | None = None
    status: str = "new"
    report: dict = Field(default_factory=dict, sa_column=Column(JSON))
    assigned_layer: int | None = None
    created_at: datetime = Field(default_factory=_now)


class Decision(SQLModel, table=True):
    """Audit log: every classification, report, tool call, human action."""

    id: int | None = Field(default=None, primary_key=True)
    case_id: int = Field(foreign_key="case.id")
    actor: str  # system | human | agent
    action: str
    payload: dict = Field(default_factory=dict, sa_column=Column(JSON))
    evidence: dict = Field(default_factory=dict, sa_column=Column(JSON))
    model: str | None = None
    created_at: datetime = Field(default_factory=_now)


class AppMeta(SQLModel, table=True):
    """Key/value facts about this database, e.g. its instance id (recreated on every re-seed)."""

    key: str = Field(primary_key=True)
    value: str


class LearningExample(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    complaint_text: str
    human_category_id: str = Field(foreign_key="category.id")
    created_at: datetime = Field(default_factory=_now)
