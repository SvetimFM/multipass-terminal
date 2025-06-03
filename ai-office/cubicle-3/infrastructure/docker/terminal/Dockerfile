# Multi-stage build for optimized production image
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git openssh-client

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY . .

# Final stage - runtime image
FROM node:20-alpine

# Install runtime dependencies and security updates
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
        bash \
        git \
        openssh-client \
        curl \
        wget \
        jq \
        python3 \
        py3-pip \
        docker-cli \
        aws-cli \
        tini && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1000 aioffice && \
    adduser -D -u 1000 -G aioffice aioffice && \
    mkdir -p /home/aioffice/.ssh && \
    chown -R aioffice:aioffice /home/aioffice

# Set up working directory
WORKDIR /app

# Copy node modules and app from builder
COPY --from=builder --chown=aioffice:aioffice /app/node_modules ./node_modules
COPY --chown=aioffice:aioffice . .

# Create necessary directories
RUN mkdir -p /app/workspace /app/logs /app/tmp && \
    chown -R aioffice:aioffice /app

# Install global npm packages for development tools
RUN npm install -g \
    typescript \
    @types/node \
    eslint \
    prettier \
    nodemon \
    pm2 && \
    npm cache clean --force

# Security: Disable shell history
RUN rm -f /home/aioffice/.bash_history && \
    ln -s /dev/null /home/aioffice/.bash_history

# Switch to non-root user
USER aioffice

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOME=/home/aioffice \
    WORKSPACE_DIR=/app/workspace \
    LOG_DIR=/app/logs \
    TMP_DIR=/app/tmp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Use tini as entrypoint to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "handler.js"]