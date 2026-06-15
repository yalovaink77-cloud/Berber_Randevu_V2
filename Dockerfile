# ── Build aşaması ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Çalışma aşaması ──────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Güvenli çalışma: root yerine özel kullanıcı
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Gereksiz dosyalar kopyalanmasın (.dockerignore ile desteklenir)
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "index.js"]
