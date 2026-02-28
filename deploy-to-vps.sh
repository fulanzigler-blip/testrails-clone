#!/bin/bash

# TestRails Clone - Deploy to Hetzner VPS (Direct Build)
# This script builds Docker images directly on the VPS instead of pulling from registry

set -e  # Exit on error

echo "🚀 Deploying TestRails Clone to Hetzner VPS..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run as root (use sudo)"
    exit 1
fi

# Step 1: Install dependencies
print_info "Installing dependencies..."
apt update
apt install -y docker.io docker-compose git curl

# Start Docker
systemctl start docker
systemctl enable docker

# Add current user to docker group (not running as root script)
print_success "Docker installed and started"

# Step 2: Clone or update repository
APP_DIR="/opt/testrails-clone"
if [ -d "$APP_DIR" ]; then
    print_info "Updating existing repository..."
    cd "$APP_DIR"
    git pull origin master
else
    print_info "Cloning repository..."
    git clone https://github.com/fulanzigler-blip/testrails-clone.git "$APP_DIR"
    cd "$APP_DIR"
fi

# Step 3: Generate secrets
print_info "Generating secure secrets..."

# Generate .env file
cat > /opt/testrails.env << 'EOF'
# Database
DB_PASSWORD=$(openssl rand -base64 32)

# JWT Secrets
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

# Environment
NODE_ENV=production

# Database URL
DATABASE_URL=postgresql://testrails:${DB_PASSWORD}@postgres:5432/testrails

# Redis URL
REDIS_URL=redis://redis:6379
EOF

print_success "Secrets generated"

# Step 4: Build Docker images
print_info "Building backend Docker image..."
cd "$APP_DIR/backend"
docker build -t testrails-backend:latest .
print_success "Backend image built"

print_info "Building frontend Docker image..."
cd "$APP_DIR/frontend"
docker build -t testrails-frontend:latest .
print_success "Frontend image built"

# Step 5: Copy docker-compose.yml
print_info "Setting up docker-compose..."
cd "$APP_DIR"
cp docker-compose-testrails.yml /root/docker-compose.yml

# Step 6: Configure firewall
print_info "Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 3000/tcp
ufw --force enable
print_success "Firewall configured"

# Step 7: Start services
print_info "Starting services..."
cd /root
docker-compose pull 2>/dev/null || true  # Pull if available
docker-compose up -d

# Step 8: Wait for services to be healthy
print_info "Waiting for services to start..."
sleep 10

# Step 9: Run database migrations
print_info "Running database migrations..."
docker-compose exec -T backend npx prisma migrate deploy || {
    print_error "Failed to run migrations"
    docker-compose logs backend
    exit 1
}

print_success "Migrations completed"

# Step 10: Verify services
print_info "Verifying services..."

# Check PostgreSQL
if docker-compose exec -T postgres pg_isready -U testrails -d testrails > /dev/null 2>&1; then
    print_success "PostgreSQL is healthy"
else
    print_error "PostgreSQL health check failed"
fi

# Check Redis
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    print_success "Redis is healthy"
else
    print_error "Redis health check failed"
fi

# Check Backend
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    print_success "Backend is healthy"
else
    print_error "Backend health check failed"
fi

# Check Frontend
if curl -f http://localhost:80 > /dev/null 2>&1; then
    print_success "Frontend is healthy"
else
    print_error "Frontend health check failed"
fi

# Get VPS IP
VPS_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 Staging Environment:"
echo "   Frontend:  http://${VPS_IP}/"
echo "   Backend:   http://${VPS_IP}:3000"
echo "   API:       http://${VPS_IP}:3000/api/v1"
echo ""
echo "🔐 Database Access:"
echo "   docker exec -it testrails-postgres psql -U testrails -d testrails"
echo ""
echo "📊 Redis Access:"
echo "   docker exec -it testrails-redis redis-cli"
echo ""
echo "📝 View Logs:"
echo "   docker-compose logs -f"
echo ""
echo "🔄 Restart Services:"
echo "   docker-compose restart"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
