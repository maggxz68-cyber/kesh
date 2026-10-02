"""Экспорт данных (ТЗ 7.6): CSV / XLSX / PDF. Только GET, фильтры как у транзакций."""
from __future__ import annotations

import csv
import io
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.core.deps import CurrentUser, DbDep, get_current_user
from app.services import reports

router = APIRouter()
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]

COLUMNS = [
    ("date", "Дата"),
    ("type", "Тип"),
    ("amount", "Сумма"),
    ("currency", "Валюта"),
    ("account", "Счёт"),
    ("category", "Категория"),
    ("counterparty", "Контрагент"),
    ("author", "Автор"),
    ("comment", "Комментарий"),
    ("tags", "Теги"),
    ("has_receipt", "Чек"),
]


async def _rows(db: DbDep, current: CurrentUser, date_from: date | None, date_to: date | None,
                type_: str | None, account_id, category_id) -> list[dict]:
    return await reports.export_transactions(
        db,
        current.family_id,
        date_from=date_from,
        date_to=date_to,
        type=type_,
        account_id=account_id,
        category_id=category_id,
    )


def _fname(ext: str) -> str:
    return f"transactions_{date.today().isoformat()}.{ext}"


@router.get("/csv")
async def export_csv(
    db: DbDep,
    current: CurrentUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
    type: str | None = Query(None, alias="type"),
    account_id=None,
    category_id=None,
) -> Response:
    rows = await _rows(db, current, date_from, date_to, type, account_id, category_id)
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    writer.writerow([h for _, h in COLUMNS])
    for r in rows:
        writer.writerow([r[k] for k, _ in COLUMNS])
    # BOM для корректной кириллицы в Excel
    body = "\ufeff" + buf.getvalue()
    return Response(
        content=body.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{_fname("csv")}"'},
    )


@router.get("/xlsx")
async def export_xlsx(
    db: DbDep,
    current: CurrentUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
    type: str | None = Query(None, alias="type"),
    account_id=None,
    category_id=None,
) -> Response:
    from openpyxl import Workbook

    rows = await _rows(db, current, date_from, date_to, type, account_id, category_id)
    wb = Workbook()
    ws = wb.active
    ws.title = "Транзакции"
    ws.append([h for _, h in COLUMNS])
    for r in rows:
        vals = []
        for k, _ in COLUMNS:
            v = r[k]
            if k == "amount":
                v = float(v)
            vals.append(v)
        ws.append(vals)
    for col_cells in ws.columns:
        width = max(len(str(c.value or "")) for c in col_cells[:200])
        ws.column_dimensions[col_cells[0].column_letter].width = min(width + 2, 40)
    bio = io.BytesIO()
    wb.save(bio)
    return Response(
        content=bio.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{_fname("xlsx")}"'},
    )


@router.get("/pdf")
async def export_pdf(
    db: DbDep,
    current: CurrentUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
    type: str | None = Query(None, alias="type"),
    account_id=None,
    category_id=None,
) -> Response:
    """PDF-отчёт: сводка за период + топ категорий + список транзакций (до 300 строк)."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    dt_from, dt_to = reports.period_bounds(date_from, date_to)
    fam_name = current.family.name
    summ = await reports.summary(db, current.family_id, dt_from, dt_to)
    top = await reports.by_category(db, current.family_id, dt_from, dt_to, kind="expense", limit=10)
    rows = await _rows(db, current, date_from, date_to, type, account_id, category_id)
    rows = rows[:300]

    # Шрифт с кириллицой: DejaVu из системных путей (в docker-образе устанавливается fonts-dejavu)
    font_name = "Helvetica"
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/DejaVuSans.ttf",
    ):
        try:
            pdfmetrics.registerFont(TTFont("DejaVu", path))
            font_name = "DejaVu"
            break
        except Exception:  # noqa: BLE001
            continue

    styles = getSampleStyleSheet()
    title_st = ParagraphStyle("t", parent=styles["Title"], fontName=font_name, fontSize=16)
    normal_st = ParagraphStyle("n", parent=styles["Normal"], fontName=font_name, fontSize=9)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm)
    el = [Paragraph(f"Финансовый отчёт — {fam_name}", title_st),
          Paragraph(f"Период: {dt_from.date():%d.%m.%Y} — {dt_to.date():%d.%m.%Y}", normal_st),
          Spacer(1, 6 * mm)]

    def fmt(d: float) -> str:
        return f"{d:,.2f}".replace(",", " ")

    summary_data = [
        ["Доходы", fmt(float(summ["income"]))],
        ["Расходы", fmt(float(summ["expense"]))],
        ["Итог", fmt(float(summ["net"]))],
        ["Наличные (прих/расх)", f'{fmt(float(summ["cash_income"]))} / {fmt(float(summ["cash_expense"]))}'],
        ["Безналичные (прих/расх)", f'{fmt(float(summ["card_income"]))} / {fmt(float(summ["card_expense"]))}'],
        ["Баланс счетов", fmt(float(summ["balance_total"]))],
    ]
    t = Table(summary_data, colWidths=[70 * mm, 60 * mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f5f5f5")),
    ]))
    el += [t, Spacer(1, 8 * mm), Paragraph("Топ расходов по категориям", title_st), Spacer(1, 2 * mm)]

    cat_data = [["Категория", "Сумма", "Доля", "Операций"]]
    for c in top:
        cat_data.append([c["category_name"], fmt(float(c["amount"])), f"{c['share']:.1%}", str(c["count"])])
    tc = Table(cat_data, colWidths=[80 * mm, 40 * mm, 25 * mm, 25 * mm])
    tc.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2ff")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
    ]))
    el += [tc, Spacer(1, 8 * mm), Paragraph(f"Транзакции (показаны первые {len(rows)})", title_st),
           Spacer(1, 2 * mm)]

    tx_data = [["Дата", "Тип", "Сумма", "Счёт", "Категория", "Контрагент", "Комментарий"]]
    for r in rows:
        tx_data.append([
            r["date"][:10], r["type"], r["amount"], r["account"][:18],
            r["category"][:18], r["counterparty"][:22], (r["comment"] or "")[:40],
        ])
    tt = Table(tx_data, repeatRows=1)
    tt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2ff")),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
    ]))
    el.append(tt)

    doc.build(el)
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_fname("pdf")}"'},
    )
