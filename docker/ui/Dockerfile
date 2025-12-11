# Multi-stage Dockerfile for RLSify UI
ARG NODE_VERSION=20

# Base stage with pnpm
FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# Development stage
FROM base AS development
ENV NODE_ENV=development

# Copy all files needed for build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages ./packages

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build dependencies (types and core, not UI since it will run in dev mode)
RUN pnpm --filter @speajus/rlsify-types build && pnpm --filter @speajus/rlsify-core build

# Expose Vite dev server port
EXPOSE 5174

# Start development server
CMD ["sh", "-c", "cd packages/ui && pnpm run dev --host 0.0.0.0 --port 5174"]

# Production build stage
FROM base AS builder

# Copy all files needed for build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages ./packages

# Install all dependencies (including devDependencies needed for build)
RUN pnpm install --frozen-lockfile

# Build all packages in dependency order
ENV NODE_ENV=production
RUN pnpm -r build

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

