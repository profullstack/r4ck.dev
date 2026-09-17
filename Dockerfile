FROM oven/bun:1.4.0-slim AS deps
WORKDIR /app
COPY package.json bun.lock* bunfig.toml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/sync/package.json packages/sync/package.json
RUN bun install --frozen-lockfile --ignore-scripts || bun install --ignore-scripts

FROM oven/bun:1.4.0-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app /app
COPY . .
RUN bun apps/web/build-client.js
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "apps/web/src/main.js"]
