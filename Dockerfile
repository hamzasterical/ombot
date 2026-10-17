# OmBot: one container, one port. Node builds the React dashboard, Python serves it plus the API.

# ---- 1. frontend build ----------------------------------------------------
FROM node:22-slim AS frontend
WORKDIR /build
COPY ombot_frontend/package.json ombot_frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ombot_frontend/ ./
# "false" = the dashboard talks to the real API; "true" = built-in mock data (no backend needed)
ARG VITE_USE_MOCK=true
ENV VITE_USE_MOCK=$VITE_USE_MOCK
RUN npm run build

# ---- 2. runtime -------------------------------------------------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend /build/dist /app/ombot_frontend/dist

# SQLite lives in /app/data; the app seeds it with demo data on first start
RUN mkdir -p /app/data && useradd --create-home --uid 10001 ombot && chown -R ombot /app
USER ombot
ENV DATABASE_URL=sqlite:////app/data/app.db

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/health', timeout=4)"
# Bind 0.0.0.0 (not 127.0.0.1) so the platform's proxy can reach it
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
