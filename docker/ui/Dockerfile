# Multi-stage Dockerfile for RLSify UI
ARG NODE_VERSION=20

# Base stage with pnpm
FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

# Development stage
FROM base AS development
ENV NODE_ENV=development

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/types ./packages/types
COPY packages/core ./packages/core
COPY packages/ui ./packages/ui

# Build dependencies
RUN cd packages/types && pnpm run build
RUN cd packages/core && pnpm run build

# Expose Vite dev server port
EXPOSE 5174

# Start development server
CMD ["sh", "-c", "cd packages/ui && pnpm run dev --host 0.0.0.0 --port 5174"]

# Production build stage
FROM base AS builder
ENV NODE_ENV=production

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/types ./packages/types
COPY packages/core ./packages/core
COPY packages/ui ./packages/ui

# Build all packages
RUN cd packages/types && pnpm run build
RUN cd packages/core && pnpm run build
RUN cd packages/ui && pnpm run build

# Production stage
FROM nginx:alpine AS production

# Copy built files
COPY --from=builder /app/packages/ui/dist /usr/share/nginx/html

# Copy nginx configuration
COPY docker/ui/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

