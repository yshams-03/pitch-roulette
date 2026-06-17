# Monorepo root — builds pitch-roulette/backend for Railway when root directory is repo root.
# Prefer setting Railway "Root Directory" to pitch-roulette/backend instead (uses backend/Dockerfile).
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY pitch-roulette/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY pitch-roulette/backend/ .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
