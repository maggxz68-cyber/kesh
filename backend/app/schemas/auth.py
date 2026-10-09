"""Pydantic-схемы аутентификации (ТЗ 5, 9)."""
from __future__ import annotations

import re

from pydantic import BaseModel, EmailStr, Field, field_validator

PASSWORD_MIN = 8


class RegisterRequest(BaseModel):
    family_name: str = Field(min_length=2, max_length=200)
    name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN, max_length=128)
    timezone: str = "Europe/Moscow"
    currency: str = Field(default="RUB", pattern=r"^[A-Z]{3}$")


class LoginRequest(BaseModel):
    # Гибкое поле: допускает email ИЛИ короткий логин (например "admin").
    # Жёсткая EmailStr-валидация блокировала вход по логину (422 без @).
    email: str = Field(min_length=1, max_length=320)
    # ОБЯЗАТЕЛЬНОЕ поле пароля. Его отсутствие ломало POST /auth/login с 500:
    # AttributeError: 'LoginRequest' object has no attribute 'password'
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _lenient_identifier(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Введите email или логин")
        # если строка похожа на email — проверяем базовую форму; иначе считаем логином
        if "@" in v and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise ValueError("Некорректный email")
        return v


class SuperadminLoginRequest(BaseModel):
    login: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=PASSWORD_MIN, max_length=128)

    @field_validator("password")
    @classmethod
    def _not_trivial(cls, v: str) -> str:
        if v.lower() in ("password", "12345678", "demo1234"):
            raise ValueError("Пароль слишком простой")
        return v


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    is_demo: bool = False
    must_change_password: bool = False


class FamilyOut(BaseModel):
    id: str
    name: str
    timezone: str
    currency: str
    is_demo: bool
    is_sandbox: bool


class AuthResponse(BaseModel):
    user: UserOut
    family: FamilyOut | None = None
    csrf_token: str
    is_demo_session: bool = False


class OkResponse(BaseModel):
    ok: bool = True
