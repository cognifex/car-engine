# frontend.Dockerfile

# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm install

# Copy full frontend root
COPY . .

# Build Vite project
RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine

# Custom nginx config
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy built frontend
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
