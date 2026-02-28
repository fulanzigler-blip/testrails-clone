#!/bin/bash

# TestRails Clone - Build & Push Docker Images
# Run this on your local machine after building backend/frontend

set -e  # Exit on error

echo "🚀 Building and pushing TestRails Docker images..."

# Check if user is logged in to GHCR
if ! docker info | grep -q "ghcr.io"; then
  echo "⚠️  Not logged in to GitHub Container Registry"
  echo "Please login first:"
  echo "echo <YOUR_GITHUB_TOKEN> | docker login ghcr.io -u <YOUR_GITHUB_USERNAME> --password-stdin"
  exit 1
fi

# Backend
echo "📦 Building backend image..."
cd backend
docker build -t ghcr.io/fulanzigler-blip/testrails-backend:latest .
echo "✅ Backend image built"

echo "📤️  Pushing backend image..."
docker push ghcr.io/fulanzigler-blip/testrails-backend:latest
echo "✅ Backend image pushed"

cd ..

# Frontend
echo "📦 Building frontend image..."
cd frontend
docker build -t ghcr.io/fulanzigler-blip/testrails-frontend:latest .
echo "✅ Frontend image built"

echo "📤️  Pushing frontend image..."
docker push ghcr.io/fulanzigler-blip/testrails-frontend:latest
echo "✅ Frontend image pushed"

cd ..

echo ""
echo "🎉 All images pushed to GitHub Container Registry!"
echo ""
echo "Next steps:"
echo "1. Copy docker-compose.yml to VPS: scp docker-compose.yml root@<VPS_IP>:~/"
echo "2. SSH to VPS: ssh root@<VPS_IP>"
echo "3. Create .env file with your secrets"
echo "4. Run: docker-compose up -d"
echo ""
echo "📚 See HETZNER_DEPLOYMENT.md for full guide"
