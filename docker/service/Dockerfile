# Multi-stage Dockerfile for RLSify gRPC Service
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
COPY buf.yaml buf.gen.yaml ./
COPY proto ./proto
COPY packages ./packages

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate protobuf types and build dependencies
RUN pnpm run buf:generate
RUN pnpm --filter @speajus/rlsify-types build && pnpm --filter @speajus/rlsify-core build

# Expose gRPC service port
EXPOSE 50051

# Start development server with hot reload
CMD ["sh", "-c", "cd packages/service && pnpm run dev"]

# Production build stage
FROM base AS builder

# Copy all files needed for build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY buf.yaml buf.gen.yaml ./
COPY proto ./proto
COPY packages ./packages

# Install all dependencies (including devDependencies needed for build)
RUN pnpm install --frozen-lockfile

# Generate protobuf types and build all packages
RUN pnpm run buf:generate
ENV NODE_ENV=production
RUN pnpm -r build

# Production stage
FROM node:${NODE_VERSION}-alpine AS production
WORKDIR /app

# Install pnpm for running the service
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy package files for production install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/core/package.json ./packages/core/
COPY packages/service/package.json ./packages/service/

# Copy built packages
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/service/dist ./packages/service/dist

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Set environment
ENV NODE_ENV=production
ENV GRPC_HOST=0.0.0.0
ENV GRPC_PORT=50051

# Expose gRPC port
EXPOSE 50051

# Health check using grpcurl (install it in production image)
# For now, we'll just check the process is running
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD pgrep -f "node.*service" || exit 1

# Run the service
CMD ["node", "packages/service/dist/index.js"]

