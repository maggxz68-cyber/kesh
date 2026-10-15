"""Модели валют и курсов обмена."""
from datetime import date
from decimal import Decimal

from sqlalchemy import String, Numeric, Date, UniqueConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin


class Currency(Base, TimestampMixin):
    """Справочник валют."""
    __tablename__ = "currencies"

    code: Mapped[str] = mapped_column(
        String(3), primary_key=True,
        doc="Код валюты (ISO 4217): RUB, USD, EUR"
    )
    name: Mapped[str] = mapped_column(
        String(100), nullable=False,
        doc="Название валюты"
    )
    symbol: Mapped[str | None] = mapped_column(
        String(10), nullable=True,
        doc="Символ валюты (₽, $, €)"
    )
    is_active: Mapped[bool] = mapped_column(
        default=True,
        doc="Активна ли валюта для выбора"
    )
    sort_order: Mapped[int] = mapped_column(
        default=0,
        doc="Порядок сортировки"
    )

    # Связи только с курсами (Account.currency — это просто строка-код)
    rates_from = relationship(
        "ExchangeRate",
        foreign_keys="ExchangeRate.from_currency_code",
        back_populates="from_currency"
    )
    rates_to = relationship(
        "ExchangeRate",
        foreign_keys="ExchangeRate.to_currency_code",
        back_populates="to_currency"
    )

    def __repr__(self) -> str:
        return f"Currency({self.code} - {self.name})"


class ExchangeRate(Base, TimestampMixin):
    """История курсов валют (относительно RUB)."""
    __tablename__ = "exchange_rates"
    __table_args__ = (
        UniqueConstraint(
            "from_currency_code", "to_currency_code", "date",
            name="uq_exchange_rate_unique"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    
    from_currency_code: Mapped[str] = mapped_column(
        String(3),
        ForeignKey("currencies.code", ondelete="CASCADE"),
        nullable=False,
        doc="Код валюты, из которой конвертируем"
    )
    to_currency_code: Mapped[str] = mapped_column(
        String(3),
        ForeignKey("currencies.code", ondelete="CASCADE"),
        nullable=False,
        doc="Код валюты, в которую конвертируем"
    )
    
    rate: Mapped[Decimal] = mapped_column(
        Numeric(18, 10), nullable=False,
        doc="Курс обмена (сколько to_currency за 1 from_currency)"
    )
    
    date: Mapped[date] = mapped_column(
        Date, nullable=False, default=date.today,
        doc="Дата курса"
    )
    
    source: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
        doc="Источник курса (CBR, manual, etc)"
    )

    # Связи
    from_currency = relationship(
        "Currency",
        foreign_keys=[from_currency_code],
        back_populates="rates_from"
    )
    to_currency = relationship(
        "Currency",
        foreign_keys=[to_currency_code],
        back_populates="rates_to"
    )

    def __repr__(self) -> str:
        return f"ExchangeRate({self.from_currency_code} -> {self.to_currency_code}: {self.rate})"
