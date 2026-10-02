"""Тесты этапа 5: API панели супер-админа (семьи, метрики, логи, impersonate,
сброс пароля, блокировка, удаление, системные категории)."""
from __future__ import annotations

import pytest

from app.services.seed import ensure_superadmin, seed_demo_family


@pytest.fixture
async def seeded(db_session):
    await ensure_superadmin(db_session)
    fam = await seed_demo_family(db_session)
    await db_session.commit()
    return fam


async def _sa_login(client):
    r = await client.post("/api/superadmin/login", json={"login": "admin", "password": "1968"})
    assert r.status_code == 200, r.text
    csrf = client.cookies.get("csrf_token")
    assert csrf
    return {"X-CSRF-Token": csrf}


async def test_sa_login_wrong_password(client, seeded):
    r = await client.post("/api/superadmin/login", json={"login": "admin", "password": "wrong"})
    assert r.status_code == 401


async def test_families_list_and_detail(client, seeded):
    h = await _sa_login(client)
    r = await client.get("/api/superadmin/families", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total"] >= 1
    demo = next(f for f in data["items"] if f["name"] == "Семья Ивановых")
    assert demo["users_count"] == 3
    assert demo["transactions_count"] > 100

    r2 = await client.get(f"/api/superadmin/families/{demo['id']}", headers=h)
    assert r2.status_code == 200
    detail = r2.json()
    assert len(detail["users"]) == 3
    assert len(detail["accounts"]) == 4
    assert len(detail["receipts"]) >= 5
    assert len(detail["recent_transactions"]) <= 200


async def test_metrics_and_logs(client, seeded):
    h = await _sa_login(client)
    m = (await client.get("/api/superadmin/metrics", headers=h)).json()
    assert m["families_total"] >= 1 and m["users_total"] >= 3
    assert m["transactions_total"] > 100
    assert m["db_size"] is not None

    l = (await client.get("/api/superadmin/logs?limit=50", headers=h)).json()
    # логин супер-админа уже записан в audit
    assert any(i["action"] == "login" and i["actor_type"] == "superadmin" for i in l["items"])


async def test_block_unblock_and_csrf(client, seeded):
    h = await _sa_login(client)
    fams = (await client.get("/api/superadmin/families", headers=h)).json()["items"]
    fid = next(f["id"] for f in fams if f["name"] != "Семья Ивановых") if len(fams) > 1 else fams[0]["id"]

    # без CSRF-заголовка — 403
    r = await client.patch(f"/api/superadmin/families/{fid}", json={"is_blocked": True})
    assert r.status_code == 403

    r = await client.patch(f"/api/superadmin/families/{fid}", json={"is_blocked": True, "reason": "тест"}, headers=h)
    assert r.status_code == 200
    fams2 = (await client.get("/api/superadmin/families", headers=h)).json()["items"]
    blocked = next(f for f in fams2 if f["id"] == fid)
    assert blocked["is_blocked"] is True

    r = await client.patch(f"/api/superadmin/families/{fid}", json={"is_blocked": False}, headers=h)
    assert r.status_code == 200


async def test_impersonate(client, seeded):
    h = await _sa_login(client)
    fams = (await client.get("/api/superadmin/families", headers=h)).json()["items"]
    demo = next(f for f in fams if f["name"] == "Семья Ивановых")
    detail = (await client.get(f"/api/superadmin/families/{demo['id']}", headers=h)).json()
    wife = next(u for u in detail["users"] if u["email"] == "wife@example.com")

    r = await client.post(
        f"/api/superadmin/families/{demo['id']}/impersonate/{wife['id']}", json={}, headers=h
    )
    assert r.status_code == 200, r.text
    # кука access_token переключена на пользователя
    assert "access_token" in r.headers.get("set-cookie", "") or client.cookies.get("access_token")

    # подставная сессия видит транзакции семьи
    hh = {"X-CSRF-Token": client.cookies.get("csrf_token")}
    txs = await client.get("/api/transactions", headers=hh)
    assert txs.status_code == 200
    assert txs.json()["total"] > 0

    # и запись в audit
    logs = (await client.get("/api/superadmin/logs?action=impersonate", headers=h)).json()
    assert logs["total"] >= 1


async def test_reset_password(client, seeded):
    h = await _sa_login(client)
    users = (await client.get("/api/superadmin/users?search=son@", headers=h)).json()
    assert len(users) == 1
    uid = users[0]["id"]
    r = await client.post(
        f"/api/superadmin/users/{uid}/reset-password",
        json={"new_password": "newpass123", "force_change": True},
        headers=h,
    )
    assert r.status_code == 200
    # вход по новому паролю
    from httpx import AsyncClient

    async with AsyncClient(transport=client._transport, base_url="http://test") as c2:
        rr = await c2.post("/api/auth/login", json={"email": "son@example.com", "password": "newpass123"})
        assert rr.status_code == 200
        assert rr.json()["user"]["must_change_password"] is True


async def test_soft_delete_family(client, seeded):
    h = await _sa_login(client)
    # зарегистрируем обычную семью через register
    reg = await client.post(
        "/api/auth/register",
        json={"family_name": "Жертва", "name": "Однораз", "email": "victim@example.com",
              "password": "secret123", "timezone": "Europe/Moscow", "currency": "RUB"},
    )
    assert reg.status_code == 201, reg.text
    fam_id = reg.json()["family"]["id"]
    # разлогин и заново под супер-админом (register переставил cookies)
    client.cookies.clear()
    h = await _sa_login(client)

    r = await client.delete(f"/api/superadmin/families/{fam_id}", headers=h)
    assert r.status_code == 200
    fams = (await client.get("/api/superadmin/families?include_deleted=true", headers=h)).json()["items"]
    victim = next(f for f in fams if f["id"] == fam_id)
    assert victim["deleted_at"] is not None

    # демо-семью удалить нельзя
    demo_id = next(f["id"] for f in fams if f["name"] == "Семья Ивановых")
    r2 = await client.delete(f"/api/superadmin/families/{demo_id}", headers=h)
    assert r2.status_code == 400


async def test_system_categories_crud(client, seeded):
    h = await _sa_login(client)
    cats = (await client.get("/api/superadmin/system-categories", headers=h)).json()
    assert len(cats) >= 30

    new = await client.post(
        "/api/superadmin/system-categories",
        json={"name": "Крипта", "kind": "expense", "icon": "coins", "color": "#f7931a"},
        headers=h,
    )
    assert new.status_code == 201
    cid = new.json()["id"]

    upd = await client.patch(f"/api/superadmin/system-categories/{cid}", json={"color": "#000000"}, headers=h)
    assert upd.status_code == 200 and upd.json()["color"] == "#000000"

    dele = await client.delete(f"/api/superadmin/system-categories/{cid}", headers=h)
    assert dele.status_code == 200


async def test_regular_user_cannot_access_sa_api(client, seeded):
    await client.post(
        "/api/auth/register",
        json={"family_name": "Обычные", "name": "Юзер", "email": "u@example.com",
              "password": "secret123", "timezone": "Europe/Moscow", "currency": "RUB"},
    )
    r = await client.get("/api/superadmin/families")
    assert r.status_code in (401, 403)
