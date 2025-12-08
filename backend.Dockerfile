# backend.Dockerfile

# ---------- Stage 1: Build automatch-ai + backend ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install and build automatch-ai
COPY automatch-ai/package*.json ./automatch-ai/
RUN cd automatch-ai && npm install

COPY automatch-ai ./automatch-ai
RUN cd automatch-ai && npm run build

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY backend ./backend

# ---------- Stage 2: Production Image ----------
FROM node:20-alpine AS production

WORKDIR /app

# Copy backend
COPY --from=builder /app/backend ./backend

# Copy compiled automatch-ai code
COPY --from=builder /app/automatch-ai/dist ./automatch-ai/dist
# Copy runtime data needed by automatch-ai (specs/offers)
COPY automatch-ai/data ./automatch-ai/data
# Copy automatch-ai node_modules (LLM deps)
COPY --from=builder /app/automatch-ai/node_modules ./automatch-ai/node_modules
# Copy backend node_modules (includes node-fetch)
COPY --from=builder /app/backend/node_modules ./backend/node_modules

WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001
CMD ["node", "index.js"]
