# Backend Dockerfile
# Template to be customized based on actual tech stack (Python/Django, Node.js/Express, etc.)

# Option 1: Python/Django backend
FROM python:3.11-slim as python-base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run application
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4"]

# Option 2: Node.js/Express backend (uncomment if using Node.js)
# FROM node:18-alpine as node-base
#
# WORKDIR /app
#
# # Install dependencies
# COPY package*.json ./
# RUN npm ci --only=production
#
# # Copy application code
# COPY . .
#
# # Expose port
# EXPOSE 3000
#
# # Health check
# HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
#     CMD curl -f http://localhost:3000/health || exit 1
#
# # Run application
# CMD ["node", "index.js"]
