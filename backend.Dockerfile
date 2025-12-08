# backend.Dockerfile
FROM node:20-alpine AS base

WORKDIR /app

# ---- Build automatch-ai ----
COPY automatch-ai/package*.json automatch-ai/
RUN cd automatch-ai && npm install && npm run build

# ---- Backend dependencies ----
COPY backend/package*.json backend/
RUN cd backend && npm install --omit=dev

# ---- Copy backend code ----
COPY backend backend

# ---- Copy automatch-ai output ----
COPY automatch-ai/dist automatch-ai/dist

WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "index.js"]
