FROM node:20-bookworm-slim AS builder

WORKDIR /app

ARG VITE_FEATURE_FLAGS="{}"
ENV VITE_FEATURE_FLAGS=${VITE_FEATURE_FLAGS}

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
EXPOSE 9090

CMD ["node", "dist/server.js"]
