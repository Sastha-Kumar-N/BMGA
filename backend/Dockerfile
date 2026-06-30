FROM node:22-alpine AS deps

WORKDIR /app
ENV NODE_ENV=development

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

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

EXPOSE 3001

CMD ["npm", "run", "docker:start"]
