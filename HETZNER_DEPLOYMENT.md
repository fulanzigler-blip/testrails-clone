# TestRails Clone - Hetzner VPS Deployment Guide

Deploy TestRails clone to Hetzner VPS (Ubuntu) using Docker Compose.

## Prerequisites

On your local machine:
- Docker installed
- gh CLI authenticated

On Hetzner VPS:
- SSH access: `ssh root@<YOUR_VPS_IP>`
- Docker & Docker Compose installed
- At least 2GB RAM, 20GB storage

## Step 1: Prepare VPS

Connect to your Hetzner VPS:
```bash
ssh root@<YOUR_VPS_IP>
```

### Install Docker & Docker Compose

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

### Enable Docker on boot
```bash
systemctl enable docker
systemctl start docker
```

## Step 2: Prepare Docker Images

On your **local machine**, build and push Docker images to GitHub Container Registry:

```bash
# Login to GHCR (do this once)
echo <YOUR_GITHUB_TOKEN> | docker login ghcr.io -u <YOUR_GITHUB_USERNAME> --password-stdin

# Build backend image
cd backend
docker build -t ghcr.io/fulanzigler-blip/testrails-backend:latest .
docker push ghcr.io/fulanzigler-blip/testrails-backend:latest

# Build frontend image
cd frontend
docker build -t ghcr.io/fulanzigler-blip/testrails-frontend:latest .
docker push ghcr.io/fulanzigler-blip/testrails-frontend:latest
```

## Step 3: Deploy to VPS

### 3.1. Copy docker-compose.yml to VPS

On your **local machine**:
```bash
scp docker-compose-testrails.yml root@<YOUR_VPS_IP>:~/docker-compose.yml
```

### 3.2. Create .env file on VPS

On your **VPS**:
```bash
ssh root@<YOUR_VPS_IP>

# Create .env file
cat > ~/testrails.env <<EOF
# Database
DB_PASSWORD=<your_secure_db_password>

# JWT Secrets (generate with: openssl rand -hex 32)
JWT_SECRET=<your_jwt_secret>
JWT_REFRESH_SECRET=<your_refresh_secret>

# GitHub Container Registry (if using GHCR)
REGISTRY_USERNAME=fulanzigler-blip
REGISTRY_TOKEN=<YOUR_GITHUB_TOKEN>
EOF
```

### 3.3. Update docker-compose.yml for GHCR

If using GitHub Container Registry, update image names in `docker-compose.yml`:
```yaml
backend:
  image: ghcr.io/fulanzigler-blip/testrails-backend:latest

frontend:
  image: ghcr.io/fulanzigler-blip/testrails-frontend:latest
```

### 3.4. Pull and start containers

```bash
# Pull images from GHCR
docker-compose pull

# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

## Step 4: Verify Deployment

```bash
# Check logs
docker-compose logs -f

# Check backend health
curl http://localhost:3000/health

# Check frontend
curl http://localhost:80
```

## Step 5: Access Your App

- **Frontend:** http://<YOUR_VPS_IP>
- **Backend API:** http://<YOUR_VPS_IP>:3000

## Firewall Configuration

Open required ports:
```bash
# Allow HTTP (frontend)
ufw allow 80/tcp

# Allow HTTPS (later when you have domain)
ufw allow 443/tcp

# Allow SSH
ufw allow 22/tcp

# Enable firewall
ufw enable
```

## Database Access (Optional)

If you need to access PostgreSQL directly:
```bash
docker exec -it testrails-postgres psql -U testrails -d testrails
```

## Redis CLI (Optional)

```bash
docker exec -it testrails-redis redis-cli
```

## Managing Services

```bash
# Stop all services
docker-compose stop

# Start all services
docker-compose start

# Restart specific service
docker-compose restart backend

# View logs
docker-compose logs backend
docker-compose logs frontend

# Rebuild and restart (after code changes)
docker-compose up -d --build
```

## Backup Database

```bash
# Backup PostgreSQL
docker exec testrails-postgres pg_dump -U testrails testrails > backup_$(date +%Y%m%d).sql

# Restore PostgreSQL
docker exec -i testrails-postgres psql -U testrails testrails < backup_20240228.sql
```

## Update Application

After pushing new images to GHCR:
```bash
# Pull new images
docker-compose pull

# Restart services
docker-compose up -d
```

## Troubleshooting

### Container won't start
```bash
docker-compose logs <service_name>
```

### Database connection error
- Check if postgres is healthy: `docker-compose ps`
- Verify DB_PASSWORD in .env matches

### Out of memory
- Check VPS resources: `free -h`
- Upgrade VPS plan if needed

## Next Steps (When you have domain)

1. Set up Nginx reverse proxy for SSL/HTTPS
2. Configure SSL certificate (Let's Encrypt)
3. Set up domain A records pointing to VPS IP
4. Configure SSL termination

## Security Notes

⚠️ **Important:**
- Change default passwords in .env
- Use strong JWT secrets (generate with: `openssl rand -hex 32`)
- Don't commit .env file to git
- Keep VPS updated: `apt update && apt upgrade`
- Use SSH key authentication, not password
