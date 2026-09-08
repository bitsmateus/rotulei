# =============================================================================
# API do Rotulei — imagem para o EasyPanel.
#
# Build a partir da RAIZ do monorepo (o contexto precisa enxergar
# packages/shared). No EasyPanel, aponte o Build Context para "/" e o
# Dockerfile para "apps/api/Dockerfile".
# =============================================================================

FROM node:24-alpine AS base
WORKDIR /app
# argon2 e um modulo nativo: precisa de toolchain para compilar no build.
RUN apk add --no-cache python3 make g++

# ── dependencias ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# --ignore-scripts nao serve aqui: argon2 PRECISA rodar o build nativo.
RUN npm ci --workspace @rotulei/api --workspace @rotulei/shared --include-workspace-root

# ── build ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace @rotulei/api

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json

# As migrations vao junto: o container roda `db:migrate` no start, para que
# subir uma versao nova nunca dependa de alguem lembrar de migrar a mao.
COPY --from=build /app/apps/api/db apps/api/db

# Nao rodar como root.
USER node

EXPOSE 3333

# `db:migrate` conecta como rotulei_owner (DATABASE_URL_MIGRATIONS); a API sobe
# como rotulei_app (DATABASE_URL). O bootstrap de roles NAO roda aqui — e um
# passo manual, uma vez por ambiente. Ver DEPLOY.md.
CMD ["sh", "-c", "npm run db:migrate --workspace @rotulei/api && node apps/api/dist/main.js"]
