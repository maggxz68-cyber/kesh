"""Интеграционные тесты этапа 4: CRUD, бюджеты, отчёты, экспорт, чеки, CSRF, изоляция."""
from __future__ import annotations

import io

import pytest

pytestmark = pytest.mark.asyncio


async def _register(client, name="Тест-семья"):
    r = await client.post(
        "/api/auth/register",
        json={
            "family_name": name,
            "name": "Владелец",
            "email": f"own{abs(hash(name)) % 10**8}@example.com",
            "password": "Secret123!",
            "timezone": "Europe/Moscow",
            "currency": "RUB",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _csrf(client):
    tok = client.cookies.get("csrf_token")
    assert tok, "csrf cookie не выставлен при register/login"
    return {"X-CSRF-Token": tok}


# ---------- Auth + шаблон семьи ----------


async def test_register_creates_template(client):
    data = await _register(client)
    assert data["user"]["role"] == "owner"
    h = _csrf(client)

    cats = (await client.get("/api/categories", headers=h)).json()
    names = {c["name"] for c in cats}
    assert {"Продукты", "Зарплата", "Коммунальные"} <= names
    assert len(cats) >= 30

    accounts = (await client.get("/api/accounts", headers=h)).json()
    assert len(accounts) == 1 and accounts[0]["name"] == "Наличные"
    assert float(accounts[0]["balance"]) == 0

    tags = (await client.get("/api/categories/-/tags", headers=h)).json()
    assert {t["name"] for t in tags} >= {"семья", "работа", "дети"}

    txs = (await client.get("/api/transactions", headers=h)).json()
    assert txs["total"] == 0


async def test_csrf_blocks_mutation_without_header(client):
    await _register(client)
    r = await client.post("/api/accounts", json={"name": "Без CSRF", "type": "cash"})
    assert r.status_code == 403


async def test_auth_required(client):
    r = await client.get("/api/accounts")
    assert r.status_code in (401, 403)


# ---------- Accounts CRUD + balances ----------


async def test_account_crud_and_transfer_updates_balances(client):
    await _register(client)
    h = _csrf(client)
    cash = (await client.get("/api/accounts", headers=h)).json()[0]

    card = (
        await client.post(
            "/api/accounts",
            headers=h,
            json={"name": "Карта", "type": "card", "currency": "RUB", "initial_balance": 5000},
        )
    ).json()
    assert float(card["balance"]) == 5000

    # income на карту
    inc = (
        await client.post(
            "/api/transactions",
            headers=h,
            json={"type": "income", "amount": 1000, "account_id": card["id"], "comment": "возврат"},
        )
    ).json()
    assert inc["amount"] in ("1000", 1000.0, 1000) or float(inc["amount"]) == 1000

    acc_after = next(a for a in (await client.get("/api/accounts", headers=h)).json() if a["id"] == card["id"])
    assert float(acc_after["balance"]) == 6000

    # transfer карта -> наличные
    tr = (
        await client.post(
            "/api/transfers",
            headers=h,
            json={"amount": 2000, "from_account_id": card["id"], "to_account_id": cash["id"]},
        )
    ).json()
    assert tr["type"] == "transfer"
    accs = {a["id"]: float(a["balance"]) for a in (await client.get("/api/accounts", headers=h)).json()}
    assert accs[card["id"]] == 4000 and accs[cash["id"]] == 2000


async def test_transaction_filters_and_pagination(client):
    await _register(client)
    h = _csrf(client)
    acc = (await client.get("/api/accounts", headers=h)).json()[0]
    cats = (await client.get("/api/categories", headers=h)).json()
    food = next(c for c in cats if c["name"] == "Продукты")
    salary = next(c for c in cats if c["name"] == "Зарплата")

    for i in range(5):
        await client.post(
            "/api/transactions",
            headers=h,
            json={"type": "expense", "amount": 100 + i, "account_id": acc["id"], "category_id": food["id"], "comment": f"магазин {i}"},
        )
    await client.post(
        "/api/transactions",
        headers=h,
        json={"type": "income", "amount": 50000, "account_id": acc["id"], "category_id": salary["id"], "comment": "зарплата"},
    )

    page = (await client.get("/api/transactions?limit=3&offset=0", headers=h)).json()
    assert page["total"] == 6 and len(page["items"]) == 3

    only_exp = (await client.get("/api/transactions?type=expense", headers=h)).json()
    assert only_exp["total"] == 5

    search = (await client.get("/api/transactions?search=зарплата", headers=h)).json()
    assert search["total"] == 1

    rng = (await client.get("/api/transactions?amount_min=500&amount_max=99999", headers=h)).json()
    assert rng["total"] == 1


async def test_bulk_delete_and_soft_delete(client):
    await _register(client)
    h = _csrf(client)
    acc = (await client.get("/api/accounts", headers=h)).json()[0]
    ids = []
    for _ in range(3):
        t = (
            await client.post(
                "/api/transactions", headers=h,
                json={"type": "expense", "amount": 50, "account_id": acc["id"]},
            )
        ).json()
        ids.append(t["id"])
    r = await client.post("/api/transactions/bulk-delete", headers=h, json={"ids": ids[:2]})
    assert r.json()["deleted"] == 2
    left = (await client.get("/api/transactions", headers=h)).json()
    assert left["total"] == 1
    r = await client.delete(f"/api/transactions/{left['items'][0]['id']}", headers=h)
    assert r.status_code == 204


# ---------- Categories: system read-only, hierarchy ----------


async def test_system_category_protection(client):
    await _register(client)
    h = _csrf(client)
    sys_cat = next(c for c in (await client.get("/api/categories", headers=h)).json() if c["is_system"])
    r = await client.patch(f"/api/categories/{sys_cat['id']}", headers=h, json={"name": "хак"})
    assert r.status_code in (403, 404)
    r = await client.delete(f"/api/categories/{sys_cat['id']}", headers=h)
    assert r.status_code in (403, 404)

    own = (
        await client.post("/api/categories", headers=h, json={"name": "Моя категория", "kind": "expense", "color": "#ff0000"})
    ).json()
    assert own["is_system"] is False
    child = (
        await client.post("/api/categories", headers=h, json={"name": "Подкатегория", "kind": "expense", "parent_id": own["id"]})
    ).json()
    assert child["parent_id"] == own["id"]
    # удаление родителя с потомком — запрещено или каскад; проверяем хотя бы отсутствие 500
    r = await client.delete(f"/api/categories/{own['id']}", headers=h)
    assert r.status_code in (204, 409, 422)


# ---------- Budgets ----------


async def test_budget_progress_and_overrun(client):
    await _register(client)
    h = _csrf(client)
    acc = (await client.get("/api/accounts", headers=h)).json()[0]
    food = next(c for c in (await client.get("/api/categories", headers=h)).json() if c["name"] == "Продукты")

    b = (
        await client.post(
            "/api/budgets", headers=h,
            json={"category_id": food["id"], "period": "monthly", "limit_amount": 1000},
        )
    ).json()
    await client.post(
        "/api/transactions", headers=h,
        json={"type": "expense", "amount": 700, "account_id": acc["id"], "category_id": food["id"]},
    )
    budgets = (await client.get("/api/budgets", headers=h)).json()
    item = next(x for x in budgets if x["id"] == b["id"])
    assert float(item["spent"]) == 700 and item["over_limit"] is False
    await client.post(
        "/api/transactions", headers=h,
        json={"type": "expense", "amount": 500, "account_id": acc["id"], "category_id": food["id"]},
    )
    item = next(x for x in (await client.get("/api/budgets", headers=h)).json() if x["id"] == b["id"])
    assert item["over_limit"] is True


# ---------- Reports & export ----------


async def test_reports_endpoints(client):
    await _register(client)
    h = _csrf(client)
    acc = (await client.get("/api/accounts", headers=h)).json()[0]
    food = next(c for c in (await client.get("/api/categories", headers=h)).json() if c["name"] == "Продукты")
    await client.post("/api/transactions", headers=h, json={"type": "income", "amount": 10000, "account_id": acc["id"]})
    await client.post("/api/transactions", headers=h, json={"type": "expense", "amount": 300, "account_id": acc["id"], "category_id": food["id"]})

    s = (await client.get("/api/reports/summary", headers=h)).json()
    assert float(s["income_total"]) == 10000 and float(s["expense_total"]) == 300

    bc = (await client.get("/api/reports/by-category", headers=h)).json()
    assert any(x["name"] == "Продукты" for x in bc["items"]) if isinstance(bc, dict) else True

    bm = (await client.get("/api/reports/by-month", headers=h)).json()
    assert isinstance(bm, (list, dict))

    cf = (await client.get("/api/reports/cashflow", headers=h)).json()
    assert isinstance(cf, (list, dict))

    csv_r = await client.get("/api/export/csv", headers=h)
    assert csv_r.status_code == 200 and "text/csv" in csv_r.headers["content-type"]
    assert "зарплата" not in csv_r.text  # просто валидность тела
    body = io.BytesIO(csv_r.content)
    assert body.read(2)  # непустой

    xlsx_r = await client.get("/api/export/xlsx", headers=h)
    assert xlsx_r.status_code == 200 and xlsx_r.content[:2] == b"PK"  # zip-сигнатура xlsx

    pdf_r = await client.get("/api/export/pdf", headers=h)
    assert pdf_r.status_code == 200 and pdf_r.content[:4] == b"%PDF"


# ---------- Multi-tenant isolation ----------


async def test_family_isolation(client):
    await _register(client, "Семья А")
    h = _csrf(client)
    acc_a = (await client.get("/api/accounts", headers=h)).json()[0]
    tx = (
        await client.post("/api/transactions", headers=h, json={"type": "expense", "amount": 111, "account_id": acc_a["id"]})
    ).json()

    # вторая семья — новый клиент (новые cookies)
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c2:
        data = await _register(c2, "Семья Б")
        h2 = {"X-CSRF-Token": c2.cookies.get("csrf_token")}
        # транзакция чужой семьи недоступна
        r = await c2.get(f"/api/transactions/{tx['id']}", headers=h2)
        assert r.status_code == 404
        # и чужой счёт тоже
        r = await c2.patch(f"/api/accounts/{acc_a['id']}", headers=h2, json={"name": "взлом"})
        assert r.status_code == 404
        page = (await c2.get("/api/transactions", headers=h2)).json()
        assert page["total"] == 0


# ---------- Receipts upload ----------


async def test_receipt_upload_flow(client):
    pytest.importorskip("PIL")
    await _register(client)
    h = _csrf(client)

    buf = io.BytesIO()
    from PIL import Image

    Image.new("RGB", (200, 300), "white").save(buf, format="PNG")
    files = {"file": ("receipt.png", buf.getvalue(), "image/png")}
    r = await client.post("/api/receipts/upload", headers=h, files=files)
    assert r.status_code == 201, r.text
    rid = r.json()["id"]

    lst = (await client.get("/api/receipts", headers=h)).json()
    assert any(x["id"] == rid for x in lst)

    f = await client.get(f"/api/receipts/{rid}/file", headers=h)
    assert f.status_code == 200 and f.content[:4] == b"\x89PNG"

    d = await client.delete(f"/api/receipts/{rid}", headers=h)
    assert d.status_code == 204


async def test_receipt_rejects_bad_mime(client):
    await _register(client)
    h = _csrf(client)
    files = {"file": ("evil.exe", b"MZ\x00\x00", "application/octet-stream")}
    r = await client.post("/api/receipts/upload", headers=h, files=files)
    assert r.status_code in (400, 415, 422)
