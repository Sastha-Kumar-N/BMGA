FROM node:22-bookworm-slim AS deps

WORKDIR /app
ENV NODE_ENV=development

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

FROM deps AS builder

COPY tsconfig.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY services ./services
COPY scripts ./scripts
COPY index.ts ./
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ncbi-blast+ openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

RUN mkdir -p /app/uploads /app/blastdb && chown -R node:node /app
USER node

EXPOSE 3001

CMD ["npm", "run", "docker:start"]
