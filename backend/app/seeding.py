"""Deterministic demo dataset in which every complaint is backed by matching records.

Each labeled complaint in seed/complaints_labeled.json gets its own customer (CUST-1xxxx, in file
order) whose transactions, cards and security events show exactly what the complaint describes:
the same amounts, timing, status and failure reasons. Routine history is generated only BEFORE the
scenario, so the complaint's transaction is always the customer's latest one. The four frontend
demo presets (CUST-88102, CUST-49120, CUST-31092, CUST-77401) and the form default (CUST-49210)
exist too.

Amounts are USD and match the fee schedule in mcp_server/policies/policy_fees_charges.md.
Emails use example.com and phones the fictional 555-01xx range, so nothing can reach a real person.
"""

import json
import random
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

from faker import Faker
from sqlmodel import Session, func, select

from app.models import (
    Account,
    Card,
    Category,
    Complaint,
    Customer,
    Merchant,
    SecurityEvent,
    Transaction,
)
from app.seed_data import CATEGORIES

LABELED = Path(__file__).resolve().parents[1] / "seed" / "complaints_labeled.json"

CITIES = ["Austin, US", "Denver, US", "Seattle, US", "Boston, US", "Atlanta, US", "Portland, US", "Raleigh, US"]

# id, name, category, city, country, complaint_count
MERCHANTS = [
    ("M01", "QuickMart", "grocery", "", "US", 2),
    ("M02", "BrightShop", "online_retail", "", "US", 5),
    ("M03", "CityCafe", "restaurant", "", "US", 0),
    ("M04", "PowerBill Co", "utility", "", "US", 3),
    ("M05", "StreamBox", "subscription", "", "US", 9),
    ("M06", "FuelNow", "fuel", "", "US", 1),
    ("M07", "GreenGrocer", "grocery", "", "US", 0),
    ("M08", "TechHub", "online_electronics", "", "US", 7),
    ("M09", "TravelEasy", "travel", "", "US", 1),
    ("M10", "BookNest", "books", "", "US", 0),
    ("M11", "ShopSphere Online", "online_retail", "", "US", 6),
    ("M12", "Spice Route Restaurant", "restaurant", "", "US", 2),
    ("M13", "MobiTop", "mobile_topup", "", "US", 4),
    ("M14", "UrbanWear", "apparel", "", "US", 3),
    ("M15", "LuxeGadgets Intl", "online_electronics", "Hong Kong", "HK", 14),
    ("M16", "LuckyStar Gaming Ltd", "online_gaming", "Valletta", "MT", 21),
    ("M17", "MetroRail Ticketing", "transport", "", "US", 3),
    ("M18", "CityCab", "taxi", "", "US", 1),
    ("M19", "Riverside Mall Food Court", "restaurant", "", "US", 0),
    ("M20", "OmBank Fees", "bank_fee", "", "US", 0),
    ("M21", "Corner Convenience", "grocery", "", "US", 0),
]
# merchant, min, max: everyday card spending
ROUTINE_SPEND = [("M01", 12, 140), ("M03", 4, 18), ("M06", 30, 75), ("M07", 15, 90), ("M10", 9, 45), ("M21", 3, 25)]
EMPLOYERS = [("Northwind Logistics", "Dallas, US"), ("Bluepeak Health", "Denver, US"), ("Cedar Labs", "Boston, US")]


@dataclass
class Person:
    customer: Customer
    checking: Account
    card: Card
    savings: Account | None = None
    credit: Account | None = None
    credit_card: Card | None = None
    anchors: list[datetime] = field(default_factory=list)  # scenario transaction times
    anchor_ids: list[str] = field(default_factory=list)  # scenario transaction ids

    @property
    def id(self) -> str:
        return self.customer.id

    @property
    def device(self) -> str:
        return self.customer.primary_device_id

    @property
    def city(self) -> str:
        return self.customer.city


class World:
    def __init__(self, session: Session, now: datetime, seed: int = 42):
        self.s = session
        self.now = now
        self.rng = random.Random(seed)
        self.fake = Faker("en_US")
        self.fake.seed_instance(seed)
        self.counters: dict[str, int] = {}
        self.merchants: dict[str, Merchant] = {}
        self.background: list[Person] = []
        self.employers: list[tuple[Account, str]] = []
        self.owner: dict[str, Person] = {}  # account id -> person

    # ---- ids and time ----------------------------------------------------------------------
    def next_id(self, kind: str, fmt: str, start: int) -> str:
        self.counters[kind] = self.counters.get(kind, start - 1) + 1
        return fmt.format(self.counters[kind])

    def ago(self, days: float = 0, hours: float = 0, minutes: float = 0) -> datetime:
        return self.now - timedelta(days=days, hours=hours, minutes=minutes)

    def night(self, days_ago: int, hour: int, minute: int) -> datetime:
        """A clock time on an earlier day, e.g. night(1, 2, 13) = yesterday 02:13."""
        return (self.now - timedelta(days=days_ago)).replace(hour=hour, minute=minute, second=0, microsecond=0)

    # ---- entities --------------------------------------------------------------------------
    def new_device(self) -> str:
        return self.next_id("device", "DEV-{:04d}", 1001)

    def account(self, customer_id: str, balance: float, kind: str = "checking", account_id: str | None = None) -> Account:
        acc = Account(
            id=account_id or self.next_id("account", "ACC-{:05d}", 10001),
            customer_id=customer_id,
            balance=round(balance, 2),
            type=kind,
        )
        self.s.add(acc)
        return acc

    def card(self, account: Account, kind: str = "debit") -> Card:
        c = Card(
            id=self.next_id("card", "CARD-{:04d}", 1001),
            account_id=account.id,
            kind=kind,
            last4=f"{self.rng.randint(0, 9999):04d}",
        )
        self.s.add(c)
        return c

    def person(
        self,
        cid: str,
        *,
        name: str | None = None,
        city: str | None = None,
        segment: str = "retail",
        balance: float | None = None,
        savings: bool = False,
        credit: bool = False,
        checking_id: str | None = None,
    ) -> Person:
        name = name or self.fake.name()
        city = city or self.rng.choice(CITIES)
        slug = re.sub(r"[^a-z]+", ".", name.lower()).strip(".")
        customer = Customer(
            id=cid,
            name=name,
            email=f"{slug}.{cid[-4:]}@example.com",
            phone=f"+1-555-01{self.rng.randint(0, 99):02d}",
            city=city,
            primary_device_id=self.new_device(),
            segment=segment,
            created_at=self.ago(days=self.rng.randint(400, 2500)),
        )
        self.s.add(customer)
        if balance is None:
            balance = self.rng.uniform(40_000, 150_000) if segment == "premier" else self.rng.uniform(1_800, 24_000)
        checking = self.account(cid, balance, account_id=checking_id)
        p = Person(customer, checking, self.card(checking))
        if savings:
            p.savings = self.account(cid, self.rng.uniform(2_000, 30_000), "savings")
        if credit:
            p.credit = self.account(cid, 0, "credit")
            p.credit_card = self.card(p.credit, "credit")
        for acc in (p.checking, p.savings, p.credit):
            if acc:
                self.owner[acc.id] = p
        return p

    def counterparty(self, name: str, city: str) -> Account:
        """Someone who banks elsewhere: an external account the bank can see but does not hold."""
        cid = self.next_id("counterparty", "CP-{:04d}", 1)
        self.s.add(Customer(id=cid, name=name, city=city, segment="counterparty"))
        return self.account(cid, 0, "external")

    def txn(
        self,
        frm: Account,
        amount: float,
        when: datetime,
        *,
        to: Account | None = None,
        merchant: str | None = None,
        channel: str = "card",
        device: str = "",
        location: str = "",
        status: str = "completed",
        description: str = "",
        failure_reason: str = "",
        anchor: bool = True,
    ) -> Transaction:
        t = Transaction(
            id=self.next_id("txn", "T{:04d}", 1),
            sender_account=frm.id,
            receiver_account=to.id if to else None,
            amount=round(amount, 2),
            merchant_id=merchant,
            channel=channel,
            device_id=device,
            location=location,
            created_at=when,
            status=status,
            description=description,
            failure_reason=failure_reason,
        )
        self.s.add(t)
        if anchor and frm.id in self.owner:
            self.owner[frm.id].anchors.append(when)
            self.owner[frm.id].anchor_ids.append(t.id)
        return t

    def buy(self, p: Person, merchant: str, amount: float, when: datetime, **kw) -> Transaction:
        m = self.merchants[merchant]
        kw.setdefault("location", f"{m.city}, {m.country}" if m.city else p.city)
        kw.setdefault("description", m.name.upper())
        return self.txn(kw.pop("account", p.checking), amount, when, merchant=merchant, **kw)

    def event(self, p: Person, kind: str, when: datetime, *, device: str | None = None, location: str | None = None, detail: str = "") -> None:
        self.s.add(
            SecurityEvent(
                customer_id=p.id,
                event_type=kind,
                device_id=p.device if device is None else device,
                location=p.city if location is None else location,
                detail=detail,
                created_at=when,
            )
        )

    # ---- routine history -------------------------------------------------------------------
    def routine(self, p: Person, until: datetime, *, subscriptions: bool = True) -> None:
        """Ordinary activity from 89 days ago up to `until`: payroll, bills, card spend, ATM, P2P, logins."""
        rng, start = self.rng, self.ago(days=89)
        if until <= start:
            return

        def when() -> datetime:
            return start + (until - start) * rng.random()

        employer, name = rng.choice(self.employers)
        pay, t = round(rng.uniform(1_800, 4_800), -1), start + timedelta(days=rng.randint(0, 13), hours=9)
        while t < until:
            self.txn(employer, pay, t, to=p.checking, channel="transfer", description=f"Payroll - {name}", anchor=False)
            t += timedelta(days=14)

        t = start + timedelta(days=rng.randint(0, 25), hours=8)
        stream = subscriptions and rng.random() < 0.5
        while t < until:
            self.buy(p, "M04", rng.uniform(85, 160), t, channel="app", device=p.device, description="POWERBILL CO electricity", anchor=False)
            if stream and t + timedelta(days=3) < until:
                self.buy(p, "M05", 15.99, t + timedelta(days=3), description="STREAMBOX Premium monthly", anchor=False)
            t += timedelta(days=30)

        for _ in range(rng.randint(10, 18)):
            merchant, lo, hi = rng.choice(ROUTINE_SPEND)
            self.buy(p, merchant, rng.uniform(lo, hi), when(), anchor=False)
        for _ in range(rng.randint(1, 2)):
            self.txn(p.checking, rng.choice([40, 60, 100, 200]), when(), channel="atm", location=p.city,
                     description=f"ATM withdrawal - {p.city}", anchor=False)  # fmt: skip
        friends = [b for b in self.background if b is not p]
        for _ in range(rng.randint(0, 2)):
            friend = rng.choice(friends)
            self.txn(p.checking, rng.uniform(20, 300), when(), to=friend.checking, channel="app", device=p.device,
                     location=p.city, description=f"P2P to {friend.customer.name}", anchor=False)  # fmt: skip

        t = max(start, self.ago(days=30)) + timedelta(hours=rng.randint(7, 21))
        while t < until:
            self.event(p, "login", t, detail="App login")
            t += timedelta(days=rng.uniform(2, 4))


# ---------------------------------------------------------------------------------------------
# Scenarios: one per labeled complaint (index in complaints_labeled.json) and per frontend preset.
# Each entry: person options, a one-line hint for the demo sheet, and the records to create.
# ---------------------------------------------------------------------------------------------
Scenario = tuple[dict, str, Callable[[World, Person], None]]


def _new_login(w: World, p: Person, when: datetime, location: str, detail: str = "Login from a device never seen before") -> str:
    dev = w.new_device()
    w.event(p, "login_new_device", when, device=dev, location=location, detail=detail)
    return dev


def s_unauth_45000(w: World, p: Person) -> None:
    dev = _new_login(w, p, w.ago(days=1, hours=2), "Miami, US")
    w.event(p, "beneficiary_added", w.ago(days=1, hours=1, minutes=50), device=dev, location="Miami, US",
            detail="Beneficiary added: Derek Holt, Harbor Trust Bank")  # fmt: skip
    w.txn(p.checking, 45_000, w.ago(days=1, hours=1, minutes=40), to=w.counterparty("Derek Holt", "Miami, US"),
          channel="web", device=dev, location="Miami, US", description="Online transfer to D. Holt - Harbor Trust Bank")  # fmt: skip


def s_unauth_last_night(w: World, p: Person) -> None:
    dev = _new_login(w, p, w.night(1, 2, 5), "Newark, US")
    to = w.counterparty("Kyle Benson", "Newark, US")
    w.txn(p.checking, 2_500, w.night(1, 2, 13), to=to, channel="app", device=dev, location="Newark, US", description="Transfer to K. Benson")
    w.txn(p.checking, 1_800, w.night(1, 2, 21), to=to, channel="app", device=dev, location="Newark, US", description="Transfer to K. Benson")


def s_unauth_three_card(w: World, p: Person) -> None:
    for minutes, amount in [(0, 412.50), (7, 389.00), (29, 455.25)]:
        w.buy(p, "M15", amount, w.ago(days=1, hours=3) + timedelta(minutes=minutes), channel="card_online",
              description="LUXEGADGETS INTL HK online")  # fmt: skip


def s_unauth_12000(w: World, p: Person) -> None:
    dev = _new_login(w, p, w.ago(hours=14), "Phoenix, US")
    stranger = w.background[3]
    w.txn(p.checking, 12_000, w.ago(hours=13, minutes=40), to=stranger.checking, channel="web", device=dev,
          location="Phoenix, US", description=f"Transfer to {stranger.customer.name}")  # fmt: skip


def s_unauth_atm(w: World, p: Person) -> None:
    w.txn(p.checking, 800, w.night(2, 23, 47), channel="atm", location="Chicago, US",
          description="ATM withdrawal - W Madison St, Chicago (card present)")  # fmt: skip


def s_unauth_alert(w: World, p: Person) -> None:
    dev = _new_login(w, p, w.ago(hours=2, minutes=10), "Detroit, US")
    w.txn(p.checking, 1_250, w.ago(hours=2), to=w.counterparty("Lena Mraz", "Detroit, US"), channel="app", device=dev,
          location="Detroit, US", description="Transfer to L. Mraz")  # fmt: skip
    w.event(p, "transaction_alert_sent", w.ago(hours=2), detail="SMS alert sent for $1,250.00 transfer")


def s_ato_password(w: World, p: Person) -> None:
    dev = _new_login(w, p, w.ago(days=2, hours=1), "Las Vegas, US")
    w.event(p, "password_changed", w.ago(days=2, minutes=55), device=dev, location="Las Vegas, US", detail="Password changed from new device")
    for h in (30, 20, 3):
        w.event(p, "login_failed", w.ago(hours=h), detail="Wrong password on primary device")


def s_ato_contact(w: World, p: Person) -> None:
    dev = _new_login(w, p, w.ago(days=1, hours=4), "Columbus, US")
    w.event(p, "email_changed", w.ago(days=1, hours=3, minutes=50), device=dev, location="Columbus, US",
            detail="Email changed to a new address on a different domain")  # fmt: skip
    w.event(p, "phone_changed", w.ago(days=1, hours=3, minutes=45), device=dev, location="Columbus, US",
            detail="Phone number on file changed to +1-555-0199")  # fmt: skip
    w.event(p, "login_failed", w.ago(hours=5), detail="Login rejected on primary device")


def s_ato_pin(w: World, p: Person) -> None:
    dev = _new_login(w, p, w.ago(hours=20), "Tampa, US")
    w.event(p, "pin_changed", w.ago(hours=19, minutes=40), device=dev, location="Tampa, US", detail="App PIN changed from new device")
    w.event(p, "login_failed", w.ago(hours=2), detail="PIN rejected on primary device")


def s_ato_otp(w: World, p: Person) -> None:
    w.event(p, "otp_sent", w.ago(days=1, hours=2), detail="OTP sent to registered phone for new device enrollment")
    dev = w.new_device()
    w.event(p, "device_enrolled", w.ago(days=1, hours=1, minutes=57), device=dev, location="Orlando, US", detail="New device enrolled using the OTP")
    w.event(p, "transfer_limit_changed", w.ago(days=1, hours=1, minutes=50), device=dev, location="Orlando, US",
            detail="Daily transfer limit raised from $2,000 to $10,000")  # fmt: skip
    w.event(p, "alerts_disabled", w.ago(days=1, hours=1, minutes=48), device=dev, location="Orlando, US", detail="Transaction alerts turned off")


def s_ato_beneficiaries(w: World, p: Person) -> None:
    dev = _new_login(w, p, w.ago(days=1, hours=6), "Reno, US")
    w.event(p, "beneficiary_added", w.ago(days=1, hours=5, minutes=50), device=dev, location="Reno, US",
            detail="Beneficiary added: Marcus Reed, Pinnacle Bank")  # fmt: skip
    w.event(p, "beneficiary_added", w.ago(days=1, hours=5, minutes=45), device=dev, location="Reno, US",
            detail="Beneficiary added: Tara Quinn, Silverline Credit Union")  # fmt: skip


def s_ato_sim_swap(w: World, p: Person) -> None:
    w.event(p, "sim_swap", w.ago(days=1, hours=6), device="", detail="Mobile carrier reports a SIM change on the registered number")
    _new_login(w, p, w.ago(days=1, hours=5), "Memphis, US", "Login with OTP delivered to the new SIM")
    w.event(p, "login_new_device", w.ago(days=1, hours=1), device=w.new_device(), location="Memphis, US", detail="Second new-device login")


def s_lost_phone_morning(w: World, p: Person) -> None:
    w.event(p, "login", w.ago(hours=3, minutes=30), detail="Last login on primary device (phone)")
    w.event(p, "session_active", w.ago(hours=3, minutes=30), detail="App session on primary device still active")


def s_lost_card_mall(w: World, p: Person) -> None:
    w.buy(p, "M19", 18.40, w.ago(hours=2), description="RIVERSIDE MALL FOOD COURT (card present)")


def s_phone_snatched(w: World, p: Person) -> None:
    w.event(p, "login", w.ago(hours=5), detail="Last login on primary device (phone)")
    w.buy(p, "M21", 60.00, w.ago(hours=1), channel="wallet", device=p.device, status="failed",
          failure_reason="Mobile wallet PIN entered incorrectly 3 times", description="CORNER CONVENIENCE wallet payment")  # fmt: skip


def s_wallet_taxi(w: World, p: Person) -> None:
    w.buy(p, "M18", 32.60, w.ago(days=1, hours=2), account=p.credit, description=f"CITYCAB ride (credit card ending {p.credit_card.last4})")  # type: ignore[union-attr]


def s_laptop_stolen(w: World, p: Person) -> None:
    w.event(p, "login", w.ago(hours=6), device="DEV-LAPTOP-" + p.id[-4:], detail="Web banking login on Windows laptop")
    w.event(p, "session_active", w.ago(hours=6), device="DEV-LAPTOP-" + p.id[-4:], detail="Web session still active")


def s_phone_misplaced(w: World, p: Person) -> None:
    w.event(p, "login", w.ago(days=2, hours=4), detail="Last login on primary device (phone); no activity since")


def s_wrong_swapped(w: World, p: Person) -> None:
    intended, wrong = w.owner["ACC-58214"], w.owner["ACC-58241"]
    for d in (62, 31):
        w.txn(p.checking, 6_000, w.ago(days=d), to=intended.checking, channel="app", device=p.device,
              description=f"Transfer to {intended.customer.name} ACC-58214", anchor=False)  # fmt: skip
    w.txn(p.checking, 20_000, w.ago(hours=3), to=wrong.checking, channel="app", device=p.device,
          description=f"Transfer to ACC-58241 ({wrong.customer.name})")  # fmt: skip


def s_wrong_contact(w: World, p: Person) -> None:
    right, wrong = w.owner["ACC-40001"], w.owner["ACC-40002"]
    for d in (45, 20):
        w.txn(p.checking, 750, w.ago(days=d), to=right.checking, channel="app", device=p.device,
              description=f"P2P to {right.customer.name} (contacts)", anchor=False)  # fmt: skip
    w.txn(p.checking, 750, w.ago(hours=5), to=wrong.checking, channel="app", device=p.device,
          description=f"P2P to {wrong.customer.name} (contacts)")  # fmt: skip


def s_wrong_iban_rent(w: World, p: Person) -> None:
    landlord = w.counterparty("Elena Ruiz (landlord)", p.city)
    for d in (61, 31):
        w.txn(p.checking, 1_450, w.ago(days=d), to=landlord, channel="web", device=p.device, description="Rent to Elena Ruiz", anchor=False)
    w.txn(p.checking, 1_450, w.ago(days=1, hours=3), to=w.counterparty("Unknown account holder", "Coastal Credit Union"),
          channel="web", device=p.device, description="Rent - beneficiary IBAN entered manually")  # fmt: skip


def s_wrong_old_landlord(w: World, p: Person) -> None:
    old = w.counterparty("Greenview Properties (previous landlord)", p.city)
    for d in (91, 61, 31):
        w.txn(p.checking, 1_600, w.ago(days=d), to=old, channel="web", device=p.device, description="Rent to Greenview Properties", anchor=False)
    w.event(p, "beneficiary_added", w.ago(days=12), detail="Beneficiary added: Maple Court Rentals (new landlord)")
    w.txn(p.checking, 1_600, w.ago(days=1, hours=1), to=old, channel="web", device=p.device, description="Rent to Greenview Properties")


def s_wrong_number_5000(w: World, p: Person) -> None:
    other = w.background[7]
    w.txn(p.checking, 5_000, w.ago(days=1, hours=5), to=other.checking, channel="p2p_mobile", device=p.device,
          description=f"P2P to mobile {other.customer.phone} ({other.customer.name})")  # fmt: skip


def s_wrong_one_digit(w: World, p: Person) -> None:
    right, wrong = w.owner["ACC-63107"], w.owner["ACC-63167"]
    for d in (40, 12):
        w.txn(p.checking, 2_300, w.ago(days=d), to=right.checking, channel="app", device=p.device,
              description="Transfer to ACC-63107", anchor=False)  # fmt: skip
    w.txn(p.checking, 2_300, w.ago(hours=6), to=wrong.checking, channel="app", device=p.device, description="Transfer to ACC-63167")


def _failed(reason: str) -> dict:
    return {"status": "failed", "failure_reason": reason}


def s_failed_checkout(w: World, p: Person) -> None:
    w.buy(p, "M11", 54.99, w.ago(hours=3), channel="card_online", **_failed("Merchant gateway timeout after debit; no capture confirmation"))


def s_failed_3500(w: World, p: Person) -> None:
    w.txn(p.checking, 3_500, w.ago(days=1, hours=2), to=w.counterparty("Brian Choi", "San Diego, US"), channel="app", device=p.device,
          description="Transfer to B. Choi", **_failed("Switch timeout after debit; automatic reversal pending"))  # fmt: skip


def s_failed_bill(w: World, p: Person) -> None:
    w.buy(p, "M04", 132.80, w.ago(days=1, hours=4), channel="app", device=p.device, description="POWERBILL CO electricity",
          **_failed("Biller returned error E502 after debit"))  # fmt: skip


def s_failed_declined(w: World, p: Person) -> None:
    w.buy(p, "M11", 89.99, w.ago(days=2), channel="card_online", **_failed("Authorization approved and amount debited; order capture failed at merchant"))


def s_failed_topup(w: World, p: Person) -> None:
    w.buy(p, "M13", 50.00, w.ago(hours=5), channel="app", device=p.device,
          **_failed("Top-up provider timeout after debit; airtime credit not delivered"))  # fmt: skip


def s_failed_transfer(w: World, p: Person) -> None:
    w.txn(p.checking, 640, w.ago(days=1, hours=1), to=w.counterparty("Ana Lopez", "El Paso, US"), channel="app", device=p.device,
          description="Transfer to A. Lopez", **_failed("Beneficiary bank rejected after debit; reversal in progress"))  # fmt: skip


def _pending(reason: str) -> dict:
    return {"status": "pending", "failure_reason": reason}


def s_pending_3days(w: World, p: Person) -> None:
    w.txn(p.checking, 1_200, w.ago(days=3, hours=1), to=w.counterparty("Grace Kim", "Chicago, US"), channel="app", device=p.device,
          description="Transfer to G. Kim", **_pending("Awaiting receiving bank confirmation"))  # fmt: skip


def s_pending_since_monday(w: World, p: Person) -> None:
    days = w.now.weekday() or 7  # days since the most recent Monday
    w.txn(p.checking, 2_800, w.ago(days=days, hours=-1), to=w.counterparty("Jay Patel", "Houston, US"),
          channel="app", device=p.device, description="Transfer to J. Patel (salary share)",
          **_pending("Compliance screening hold"))  # fmt: skip


def s_pending_international(w: World, p: Person) -> None:
    w.txn(p.checking, 3_400, w.ago(days=7, hours=2), to=w.counterparty("Rui Almeida", "Lisbon, PT"), channel="web", device=p.device,
          location=p.city, description="International wire to Lisbon, PT (SWIFT)",
          **_pending("Held at intermediary bank"))  # fmt: skip


def s_pending_supplier(w: World, p: Person) -> None:
    w.txn(p.checking, 4_750, w.ago(days=2, hours=1), to=w.counterparty("Global Freight Supplies", "Newark, US"), channel="web",
          device=p.device, description="Payment to Global Freight Supplies (first payment to this beneficiary)",
          **_pending("Fraud screening hold: first payment to a new beneficiary"))  # fmt: skip


def s_pending_interbank(w: World, p: Person) -> None:
    w.txn(p.checking, 900, w.ago(days=1, hours=2), to=w.counterparty("Omar Haddad", "Detroit, US"), channel="app", device=p.device,
          description="Transfer to O. Haddad", **_pending("Interbank settlement batch pending (submitted after the 17:00 cut-off)"))  # fmt: skip


def s_pending_incoming(w: World, p: Person) -> None:
    sender = w.counterparty("Hannah Weber", "Minneapolis, US")
    w.txn(sender, 2_150, w.ago(days=3, hours=3), to=p.checking, channel="transfer", description="Incoming transfer from H. Weber",
          **_pending("Inbound transfer held for beneficiary name check"))  # fmt: skip


def s_dup_online(w: World, p: Person) -> None:
    for sec in (0, 40):
        w.buy(p, "M11", 129.99, w.ago(days=2) + timedelta(seconds=sec), channel="card_online", description="SHOPSPHERE ONLINE order #SS-48213")


def s_dup_subscription(w: World, p: Person) -> None:
    for d in (63, 33):
        w.buy(p, "M05", 15.99, w.ago(days=d), description="STREAMBOX Premium monthly", anchor=False)
    w.buy(p, "M05", 15.99, w.ago(days=3), description="STREAMBOX Premium monthly")


def s_dup_not_arrived(w: World, p: Person) -> None:
    w.buy(p, "M08", 279.00, w.ago(days=18), channel="card_online", description="TECHHUB order #TH-90217 (standard delivery)")


def s_dup_restaurant(w: World, p: Person) -> None:
    for minute in (41, 43):
        w.buy(p, "M12", 64.20, w.night(1, 20, minute), description="SPICE ROUTE RESTAURANT table 12")


def s_dup_discount(w: World, p: Person) -> None:
    w.buy(p, "M14", 120.00, w.ago(days=1, hours=5), description="URBANWEAR store - jacket (full price)")


def s_dup_refund(w: World, p: Person) -> None:
    w.buy(p, "M02", 74.50, w.ago(days=30), channel="card_online", description="BRIGHTSHOP order #BS-1187")


def s_app_crash(w: World, p: Person) -> None:
    for h in (30, 26, 2):
        w.event(p, "app_crash", w.ago(hours=h), detail="App v5.2.0 crashed on launch (Android 14)")
    for h in (25, 3):
        w.event(p, "app_reinstalled", w.ago(hours=h), detail="App reinstalled")


def s_app_reset_email(w: World, p: Person) -> None:
    for h in (20, 6, 1):
        w.event(p, "password_reset_requested", w.ago(hours=h), detail=f"Reset email sent to {p.customer.email}")


def s_app_fingerprint(w: World, p: Person) -> None:
    w.event(p, "app_updated", w.ago(days=2), detail="App updated to v5.2.0")
    for h in (40, 22, 4, 1):
        w.event(p, "biometric_login_failed", w.ago(hours=h), detail="Fingerprint not recognised after update")


def s_app_slow(w: World, p: Person) -> None:
    for h in (9, 2):
        w.event(p, "app_error", w.ago(hours=h), detail="Transactions tab timed out after 30s (blank screen)")


def s_app_new_phone(w: World, p: Person) -> None:
    dev = w.new_device()
    w.event(p, "login_failed", w.ago(hours=4), device=dev, detail="Network error: new phone not yet registered")
    w.event(p, "device_registration_pending", w.ago(hours=4), device=dev, detail="New phone awaiting registration")


def s_fee_maintenance(w: World, p: Person) -> None:
    for d in (62, 32):
        w.buy(p, "M20", 12.00, w.ago(days=d), channel="fee", description="Monthly maintenance fee (average balance below $1,500)", anchor=False)
    w.buy(p, "M20", 12.00, w.ago(days=2), channel="fee", description="Monthly maintenance fee (average balance below $1,500)")


def s_fee_150(w: World, p: Person) -> None:
    w.buy(p, "M20", 150.00, w.ago(days=2), channel="fee", description="Premier package annual service fee")


def s_fee_instant(w: World, p: Person) -> None:
    w.txn(p.checking, 300, w.ago(days=3, minutes=1), to=w.background[5].checking, channel="instant", device=p.device,
          description=f"Instant transfer to {w.background[5].customer.name}")  # fmt: skip
    w.buy(p, "M20", 3.00, w.ago(days=3), channel="fee", description="Instant transfer fee (1% of $300.00)")


def s_multi_crash_unauth(w: World, p: Person) -> None:
    s_app_crash(w, p)
    w.buy(p, "M15", 620.00, w.ago(days=1, hours=1), channel="card_online", description="LUXEGADGETS INTL HK online")


def s_multi_fee_phone(w: World, p: Person) -> None:
    w.buy(p, "M20", 35.00, w.ago(days=2), channel="fee", description="Overdraft fee - payment presented with insufficient funds")
    w.event(p, "login", w.ago(days=1, hours=3), detail="Last login on primary device (phone); no activity since")


def s_multi_pending_login(w: World, p: Person) -> None:
    s_pending_3days(w, p)
    for h in (30, 10, 2):
        w.event(p, "login_failed", w.ago(hours=h), detail="Session expired; re-authentication failed")


def s_multi_dup_support(w: World, p: Person) -> None:
    for sec in (0, 55):
        w.buy(p, "M01", 42.75, w.ago(days=2) + timedelta(seconds=sec), description="QUICKMART store #214")


def s_multi_failed_ato(w: World, p: Person) -> None:
    w.buy(p, "M11", 210.00, w.ago(days=1, hours=2), channel="card_online", **_failed("Timeout after debit; no capture confirmation"))
    dev = _new_login(w, p, w.ago(hours=21), "Louisville, US")
    w.event(p, "password_changed", w.ago(hours=20, minutes=50), device=dev, location="Louisville, US", detail="Password changed from new device")


def s_quiet(w: World, p: Person) -> None:
    """Questions, feedback, out-of-scope and vague complaints: routine history only."""


def s_preset_gaming(w: World, p: Person) -> None:
    charge = w.night(0, 3, 12) if w.now.hour >= 4 else w.night(1, 3, 12)  # the most recent 03:12
    w.event(p, "login", charge - timedelta(hours=4, minutes=32), detail="Last login on primary device before the charge")
    w.buy(p, "M16", 3_200.00, charge, channel="card_online", description=f"LUCKYSTAR GAMING LTD MT online (card ending {p.card.last4})")
    w.buy(p, "M16", 1_500.00, charge + timedelta(minutes=7), channel="card_online", description="LUCKYSTAR GAMING LTD MT online",
          **_failed("Declined: velocity check after previous charge"))  # fmt: skip


def s_preset_train(w: World, p: Person) -> None:
    w.buy(p, "M17", 85.50, w.ago(days=1, hours=7), description="METRORAIL TICKETING machine, Central Station",
          **_failed("Network timeout after debit; reversal not yet posted"))  # fmt: skip


def s_preset_atm_fee(w: World, p: Person) -> None:
    w.txn(p.checking, 100, w.ago(days=1, hours=2, minutes=1), channel="atm", location=p.city,
          description="ATM withdrawal - FreshFare Grocery ATM (out-of-network)")  # fmt: skip
    w.buy(p, "M20", 2.50, w.ago(days=1, hours=2), channel="fee", description="Out-of-network ATM fee (FreshFare Grocery ATM)")


def s_preset_vault(w: World, p: Person) -> None:
    w.txn(p.checking, 120, w.ago(days=1, hours=6), to=p.savings, channel="auto_save",
          description="Smart Budget auto-save to Savings Vault (rule: grocery spend below 3-month average)")  # fmt: skip


PREMIER = {"segment": "premier"}

# index in complaints_labeled.json -> (person options, demo hint, scenario)
LABELED_SCENARIOS: dict[int, Scenario] = {
    0: (PREMIER, "$45,000 web transfer from a new device in Miami to a new beneficiary", s_unauth_45000),
    1: ({}, "Two app transfers ($2,500 + $1,800) at 02:13/02:21 from a new device in Newark", s_unauth_last_night),
    2: ({}, "Three online card payments at LuxeGadgets Intl, Hong Kong (14 prior complaints)", s_unauth_three_card),
    3: (PREMIER, "$12,000 web transfer to an in-bank stranger from a new device in Phoenix", s_unauth_12000),
    4: ({"city": "Seattle, US"}, "$800 ATM withdrawal in Chicago at 23:47; customer lives in Seattle", s_unauth_atm),
    5: ({}, "$1,250 transfer from a new device in Detroit, SMS alert sent", s_unauth_alert),
    6: ({}, "New-device login in Las Vegas, password changed, then failed logins on the real phone", s_ato_password),
    7: ({}, "Email and phone changed from a new device in Columbus", s_ato_contact),
    8: ({}, "New-device login in Tampa, PIN changed, PIN rejected on primary device", s_ato_pin),
    9: ({}, "OTP used to enrol a new device, limit raised to $10,000, alerts turned off", s_ato_otp),
    10: ({}, "Two beneficiaries added from a new device in Reno", s_ato_beneficiaries),
    11: ({}, "Carrier SIM swap followed by new-device logins in Memphis", s_ato_sim_swap),
    12: ({}, "Last phone login 3.5h ago, session still active, no transactions since", s_lost_phone_morning),
    13: ({}, "Last card use at Riverside Mall Food Court 2h ago, card still active", s_lost_card_mall),
    14: ({}, "Failed wallet payment after the snatch: PIN wrong 3 times", s_phone_snatched),
    15: ({"credit": True}, "Credit card last used for a CityCab ride, still active", s_wallet_taxi),
    16: ({}, "Web session on a laptop still active", s_laptop_stolen),
    17: ({}, "Last phone login 2 days ago, no activity since", s_phone_misplaced),
    18: (PREMIER, "$20,000 to ACC-58241; previous payments went to ACC-58214 (digits swapped)", s_wrong_swapped),
    19: ({}, "$750 to the wrong contact; previous $750 payments went to a similar name", s_wrong_contact),
    20: ({}, "$1,450 rent to an unknown account; previous rent went to Elena Ruiz", s_wrong_iban_rent),
    21: ({}, "$1,600 rent to the previous landlord; new landlord added 12 days ago", s_wrong_old_landlord),
    22: ({}, "$5,000 P2P to a mobile number of an in-bank customer", s_wrong_number_5000),
    23: ({}, "$2,300 to ACC-63167; previous payments went to ACC-63107", s_wrong_one_digit),
    24: ({}, "$54.99 ShopSphere checkout failed after debit (gateway timeout)", s_failed_checkout),
    25: ({}, "$3,500 transfer failed after debit, reversal pending", s_failed_3500),
    26: ({}, "$132.80 PowerBill payment, biller error E502 after debit", s_failed_bill),
    27: ({}, "$89.99 ShopSphere: authorization approved, order capture failed", s_failed_declined),
    28: ({}, "$50 MobiTop top-up timed out, credit not delivered", s_failed_topup),
    29: ({}, "$640 transfer rejected by beneficiary bank after debit", s_failed_transfer),
    30: ({}, "$1,200 transfer pending 3 days, awaiting receiving bank", s_pending_3days),
    31: ({}, "$2,800 transfer pending since Monday on a compliance screening hold", s_pending_since_monday),
    32: ({}, "$3,400 international wire to Lisbon held at intermediary bank for 7 days", s_pending_international),
    33: ({}, "$4,750 supplier payment on a fraud screening hold (new beneficiary)", s_pending_supplier),
    34: ({}, "$900 interbank transfer after the 17:00 cut-off, settlement pending", s_pending_interbank),
    35: ({}, "Incoming $2,150 held for a beneficiary name check", s_pending_incoming),
    36: ({}, "Two $129.99 ShopSphere charges 40 seconds apart, same order number", s_dup_online),
    37: ({}, "StreamBox $15.99 charged again 3 days ago", s_dup_subscription),
    38: ({}, "$279 TechHub order 18 days ago", s_dup_not_arrived),
    39: ({}, "Two $64.20 Spice Route charges two minutes apart", s_dup_restaurant),
    40: ({}, "$120 UrbanWear full-price charge", s_dup_discount),
    41: ({}, "$74.50 BrightShop order 30 days ago, no refund posted", s_dup_refund),
    42: ({}, "Three app crashes on launch (v5.2.0, Android 14), two reinstalls", s_app_crash),
    43: ({}, "Three password reset emails sent to the address on file", s_app_reset_email),
    44: ({}, "App updated to v5.2.0, then four fingerprint failures", s_app_fingerprint),
    45: ({}, "Transactions tab timeouts", s_app_slow),
    46: ({}, "Login from a new phone failed: device registration pending", s_app_new_phone),
    49: ({"balance": 940.0}, "$12 monthly maintenance fee, balance below $1,500", s_fee_maintenance),
    51: (PREMIER, "$150 Premier package annual service fee", s_fee_150),
    53: ({}, "$3 instant transfer fee on a $300 instant transfer", s_fee_instant),
    60: ({}, "App crashes plus a $620 LuxeGadgets HK card payment", s_multi_crash_unauth),
    61: ({"balance": 12.40}, "$35 overdraft fee; last phone login yesterday", s_multi_fee_phone),
    62: ({}, "$1,200 transfer pending 3 days plus failed re-authentication", s_multi_pending_login),
    63: ({}, "Two $42.75 QuickMart charges 55 seconds apart", s_multi_dup_support),
    64: ({}, "$210 failed payment after debit plus password changed from a new device", s_multi_failed_ato),
}

# frontend presets (ombot_frontend/src/pages/SubmitComplaint.tsx): customer id -> scenario
PRESETS: dict[str, Scenario] = {
    "CUST-88102": ({}, "$3,200 LuckyStar Gaming (Malta) at 03:12 plus a declined $1,500 retry", s_preset_gaming),
    "CUST-49120": ({}, "$85.50 MetroRail ticket machine: network timeout after debit", s_preset_train),
    "CUST-31092": (PREMIER, "$2.50 out-of-network ATM fee at a grocery ATM (Premier: in-network ATMs free)", s_preset_atm_fee),
    "CUST-77401": ({"savings": True}, "$120 Smart Budget auto-save into the Savings Vault", s_preset_vault),
    "CUST-49210": ({}, "Ordinary customer, routine history only (form default)", s_quiet),
}


@dataclass
class SeedSummary:
    counts: dict[str, int]
    demo: list[dict]  # customer_id, complaint, category, tier, hint


def build(session: Session, now: datetime | None = None, seed: int = 42) -> SeedSummary:
    """Fill an EMPTY database. Same seed and same `now` give the same data."""
    now = now or datetime.now(UTC)
    w = World(session, now, seed)

    for cid, name, tier, desc, examples, causes, refs in CATEGORIES:
        session.add(Category(id=cid, name=name, tier=tier, description=desc, examples=examples, causes=causes,
                             policy_refs=refs, source="seed"))  # fmt: skip
    for mid, name, category, city, country, complaints in MERCHANTS:
        w.merchants[mid] = Merchant(id=mid, name=name, category=category, city=city, country=country, complaint_count=complaints)
        session.add(w.merchants[mid])
    w.employers = [(w.counterparty(name, city), name) for name, city in EMPLOYERS]

    # Background customers: recipients of P2P and wrong transfers. Some need fixed account ids.
    fixed = {0: ("Sam Cartwright", "ACC-40001"), 1: ("Sam Carter", "ACC-40002"), 2: (None, "ACC-58214"),
             3: (None, "ACC-58241"), 4: (None, "ACC-63107"), 5: (None, "ACC-63167")}  # fmt: skip
    for i in range(40):
        name, acc = fixed.get(i, (None, None))
        w.background.append(w.person(f"CUST-2{i + 1:04d}", name=name, checking_id=acc, savings=w.rng.random() < 0.4))
    for b in w.background:
        w.routine(b, w.ago(days=1))

    labeled = json.loads(LABELED.read_text(encoding="utf-8"))
    demo: list[dict] = []
    people: list[tuple[Person, Scenario, dict | None]] = []
    for i, item in enumerate(labeled):
        opts, hint, fn = LABELED_SCENARIOS.get(i, ({}, "Routine history only", s_quiet))
        people.append((w.person(f"CUST-1{i + 1:04d}", **opts), (opts, hint, fn), item))
    for cid, scenario in PRESETS.items():
        people.append((w.person(cid, **scenario[0]), scenario, None))

    for p, (_, hint, fn), item in people:
        fn(w, p)
        # routine history ends before the scenario, so the scenario transaction is the latest one
        until = min([w.ago(days=4), *(a - timedelta(hours=12) for a in p.anchors)])
        w.routine(p, until, subscriptions=fn is not s_dup_subscription)
        if item is not None:
            session.add(Complaint(customer_id=p.id, text=item["text"], received_at=w.ago(minutes=30),
                                  true_category=item["true_category"], true_tier=item["true_tier"]))  # fmt: skip
        demo.append({
            "customer_id": p.id,
            "complaint": item["text"] if item else None,
            "category": item["true_category"] if item else None,
            "tier": item["true_tier"] if item else None,
            "hint": hint,
            "scenario_txn_ids": p.anchor_ids,
        })  # fmt: skip

    session.commit()
    counted = (Category, Merchant, Customer, Account, Card, Transaction, SecurityEvent, Complaint)
    counts = {m.__tablename__: session.exec(select(func.count()).select_from(m)).one() for m in counted}
    return SeedSummary(counts, demo)
