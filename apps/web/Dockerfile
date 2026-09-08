# =============================================================================
# Frontend do Rotulei — build estatico servido por nginx.
#
# Build a partir da RAIZ do monorepo. No EasyPanel: Build Context "/",
# Dockerfile "apps/web/Dockerfile".
# =============================================================================

FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @rotulei/web --workspace @rotulei/shared --include-workspace-root

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace @rotulei/web

# ── runtime ──────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# A imagem do nginx aplica envsubst nos arquivos de /etc/nginx/templates,
# entao API_UPSTREAM vira configuravel por variavel de ambiente no EasyPanel.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=http://api:3333

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
