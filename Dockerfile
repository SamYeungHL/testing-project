# --- Build stage ---
FROM node:20-bullseye-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN mkdir -p public
RUN npm run build

# --- Runtime stage ---
FROM node:20-bullseye-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy Next.js standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser || true
USER appuser

EXPOSE 8080
CMD ["node", "server.js"]
