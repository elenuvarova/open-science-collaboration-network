# Single-container build: nginx-free, uvicorn serves /api + the built SPA on one port.
# Stage 1: build the React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: FastAPI runtime
FROM python:3.12-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8000
ENV PYTHONUNBUFFERED=1
WORKDIR /app/backend
# wget for the HEALTHCHECK probe (not in python:3.12-slim by default).
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist ./public

# Run as a non-root user.
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Probe the app's own /api/health so Coolify/Traefik only routes traffic to a
# container that can actually reach its DB. start-period covers fastembed warmup.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
