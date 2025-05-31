#!/bin/bash

echo "🚀 Starting Ship Anywhere..."
echo "=============================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Always restart Redis to ensure it's running
echo "📦 Starting Redis..."
docker-compose down > /dev/null 2>&1
docker-compose up -d

# Wait for Redis to be ready
echo "⏳ Waiting for Redis..."
for i in {1..10}; do
    if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
        echo "✅ Redis is ready!"
        break
    fi
    sleep 1
done

# Build TypeScript (ignore errors for now)
echo "🔨 Building server..."
npm run build

# Start server
echo "🖥️  Starting server..."
echo "   HTTP API: http://localhost:3010"
echo "   WebSocket: ws://localhost:3011"
echo ""
npm start