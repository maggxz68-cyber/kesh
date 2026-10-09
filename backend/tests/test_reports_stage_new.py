"""Тесты новой системы отчётов: period, by-category(top_n), by-account, transactions, receipts."""
from __future__ import annotations

import io


async def _register(client):
    r = await client.post(
        "/api/auth/register",
        json={
            "family_name": "Отчётная",
            "name": "Владелец",
            "email": "rep@example.com",
            "password": "secret123",
            "timezone": "Europe/Moscow",
            "currency": "RUB",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _csrf(client):
    tok = client.cookies.get("csrf_token")
    assert tok, "csrf cookie не выставлен"
    return {"X-CSRF-Token": tok}


async def _seed_txs(client, h):
    acc = (await client.get("/api/accounts", headers=h)).json()[0]
    cats = (await client.get("/api/categories", headers=h)).json()
    food = next(c for c in cats if c["name"] == "Продукты")
    taxi = next(c for c in cats if c["name"] == "Транспорт")
    await client.post("/api/transactions", headers=h, json={"type": "income", "amount": 50000, "account_id": acc["id"], "comment": "зарплата"})
    await client.post("/api/transactions", headers=h, json={"type": "expense", "amount": 1200.5, "account_id": acc["id"], "category_id": food["id"], "comment": "пятёрочка"})
    await client.post("/api/transactions", headers=h, json={"type": "expense", "amount": 450, "account_id": acc["id"], "category_id": taxi["id"], "comment": "такси аэропорт"})
    return acc


async def test_period_report_day(client):
    await _register(client)
    h = _csrf(client)
    await _seed_txs(client, h)
    r = await client.get("/api/reports/period?group_by=day", headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    assert float(d["income"]) == 50000 and float(d["expense"]) == 1650.5
    assert d["transactions_count"] == 3
    assert len(d["items"]) >= 1
    day = d["items"][0]
    assert float(day["income"]) > 0


async def test_period_report_group_category_account(client):
    await _register(client)
    h = _csrf(client)
    await _seed_txs(client, h)
    rc = await client.get("/api/reports/period?group_by=category&type=expense", headers=h)
    assert rc.status_code == 200
    dc = rc.json()
    labels = {g["label"] for g in dc["items"]}
    assert {"Продукты", "Транспорт"} <= labels
    assert all(0 <= g["share"] <= 1 for g in dc["items"])

    ra = await client.get("/api/reports/period?group_by=account", headers=h)
    assert ra.status_code == 200
    assert any(g["label"] == "Наличные" for g in ra.json()["items"])


async def test_by_account_movement(client):
    await _register(client)
    h = _csrf(client)
    acc = await _seed_txs(client, h)
    r = await client.get("/api/reports/by-account", headers=h)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    a = next(x for x in items if x["account_id"] == acc["id"])
    assert float(a["inflow"]) == 50000 and float(a["outflow"]) == 1650.5
    # opening+closing согласованы: closing = opening + inflow - outflow
    assert abs(float(a["closing_balance"]) - (float(a["opening_balance"]) + 50000 - 1650.5)) < 0.01


async def test_transactions_detail_filters_pagination(client):
    await _register(client)
    h = _csrf(client)
    await _seed_txs(client, h)
    r = await client.get("/api/reports/transactions?limit=2&skip=0", headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["total"] == 3 and len(d["items"]) == 2
    r2 = await client.get("/api/reports/transactions?search=такси", headers=h)
    assert r2.json()["total"] == 1
    assert r2.json()["items"][0]["category_name"] == "Транспорт"
    r3 = await client.get("/api/reports/transactions?type=income", headers=h)
    assert r3.json()["total"] == 1


async def test_receipts_and_budgets_reports(client):
    await _register(client)
    h = _csrf(client)
    rr = await client.get("/api/reports/receipts", headers=h)
    assert rr.status_code == 200
    body = rr.json()
    assert body["count"] == 0 and isinstance(body["top_stores"], list) and isinstance(body["receipts"], list)

    rb = await client.get("/api/reports/budgets", headers=h)
    assert rb.status_code == 200
    assert isinstance(rb.json(), list)


async def test_by_category_top_n_and_percent(client):
    await _register(client)
    h = _csrf(client)
    await _seed_txs(client, h)
    r = await client.get("/api/reports/by-category?type=expense&top_n=1", headers=h)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["category_name"] == "Продукты"  # 1200.5 > 450
    assert abs(items[0]["share"] - 1200.5 / 1650.5) < 0.001
    assert items[0]["count"] == 1


async def test_summary_report_arbitrary_period(client):
    await _register(client)
    h = _csrf(client)
    await _seed_txs(client, h)
    r = await client.get("/api/reports/summary?date_from=2020-01-01&date_to=2020-12-31", headers=h)
    assert r.status_code == 200
    s = r.json()
    assert float(s["income_total"]) == 0 and float(s["expense_total"]) == 0
    # «баланс» — общий остаток по счетам, не зависит от периода
    assert "balance" in s


async def test_family_isolation_new_reports(client):
    await _register(client)
    h = _csrf(client)
    await _seed_txs(client, h)
    # вторая семья: новый клиент, чтобы не зависеть от cookie первой сессии
    from httpx import ASGITransport, AsyncClient as _AC
    from app.main import app as _app
    client2 = _AC(transport=ASGITransport(app=_app), base_url="http://test")
    await client2.__aenter__()
    r = await client2.post(
        "/api/auth/register",
        json={"family_name": "Чужие", "name": "Иван", "email": "other@example.com", "password": "secret123", "timezone": "UTC", "currency": "RUB"},
    )
    assert r.status_code == 201, r.text
    h2 = _csrf(client2)
    for path in ("/api/reports/period", "/api/reports/by-account", "/api/reports/transactions", "/api/reports/receipts"):
        rr = await client2.get(path, headers=h2)
        assert rr.status_code == 200, path
        body = rr.json()
        tx_total = body.get("total") or body.get("transactions_count") or 0
        if "items" in body and isinstance(body["items"], list) and path != "/api/reports/receipts":
            assert len(body["items"]) == 0 or tx_total == 0, path
    csv_r = await client2.get("/api/export/csv", headers=h2)
    assert csv_r.status_code == 200 and len(io.BytesIO(csv_r.content).read().splitlines()) <= 2
    await client2.__aexit__(None, None, None)
