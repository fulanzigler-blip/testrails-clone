# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-bookworm-slim

WORKDIR /app

# Install dumb-init, gosu, OpenSSL, and Playwright system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init gosu openssl libssl3 \
    libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 libxshmfence1 && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r nodejs -g 1001 && \
    useradd -r -g nodejs -u 1001 -m nodejs

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies (on Debian - Prisma will use OpenSSL 3)
RUN npm ci --only=production && \
    npm cache clean --force

# Regenerate Prisma client on Debian (uses correct OpenSSL version)
RUN npx prisma generate

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create uploads directory
RUN mkdir -p /app/uploads && \
    chown -R nodejs:nodejs /app

# Copy entrypoint script (runs as root to fix SSH key permissions, then drops to nodejs)
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["dumb-init", "--", "node", "dist/index.js"]
