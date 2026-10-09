# syntax=docker/dockerfile:1.7
# ============================== builder ==============================
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

# Системные зависимости для сборки psycopg/asyncpg и numpy (opencv)
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
RUN pip wheel --wheel-dir /wheels ".[prod]"

# ============================== runtime ==============================
FROM python:3.12-slim AS runtime

LABEL org.opencontainers.image.title="family-finance-backend" \
      org.opencontainers.image.description="FastAPI backend for family finance tracker"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TZ=Europe/Moscow

# Только рантайм-зависимости: tesseract OCR, zbar (pyzbar), libs для opencv-headless.
# ВАЖНО: полный набор системных библиотек для OCR/QR выполняется ДО pip install
# (установка wheels ниже) — иначе pytesseract/pyzbar/cv2 падают с Internal Server Error.
# libgl1: в slim-образах Debian bookworm пакет libgl1-mesa-glx отсутствует (заменён на libgl1).
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl libpq5 \
      tesseract-ocr \
      tesseract-ocr-rus \
      tesseract-ocr-eng \
      libzbar0 \
      libgl1 \
      libglib2.0-0 \
      fonts-dejavu-core \
      tzdata \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /usr/sbin/nologin appuser

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN pip install --no-index --find-links=/wheels /wheels/*.whl && rm -rf /wheels

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts

# Директории данных/логов с правами appuser
RUN mkdir -p /data/receipts /logs && chown -R appuser:appuser /app /data /logs

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/api/health', timeout=3)" || exit 1

# entrypoint: ждёт БД, накатывает миграции, запускает uvicorn
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2"]
