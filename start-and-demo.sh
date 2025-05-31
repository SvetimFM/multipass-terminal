#!/bin/bash

echo "🚀 Starting Ship Anywhere Server..."

# Check if Redis is running
if ! redis-cli ping > /dev/null 2>&1; then
    echo "⚠️  Redis is not running. Please start Redis first:"
    echo "   docker-compose up -d"
    echo "   or"
    echo "   docker run -d -p 6379:6379 redis:alpine"
    exit 1
fi

echo "✅ Redis is running"

# Kill any existing server
pkill -f "node.*dist/index.js" 2>/dev/null

# Start the server in background
cd "/mnt/j/DevWorkspace/Active Projects/vibecodes/ship_anywhere_serverside"
echo "📦 Starting server..."
nohup node dist/index.js > server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
for i in {1..10}; do
    if curl -s http://localhost:3010/health > /dev/null 2>&1; then
        echo "✅ Server is running!"
        break
    fi
    sleep 1
done

# Check if server started
if ! curl -s http://localhost:3010/health > /dev/null 2>&1; then
    echo "❌ Server failed to start. Check server.log for errors"
    cat server.log
    exit 1
fi

# Run the demo
echo ""
echo "🎭 Running interactive demo..."
echo "================================"
sleep 2

node examples/interactive-demo.js

# Kill the server when done
echo ""
echo "🛑 Stopping server..."
kill $SERVER_PID 2>/dev/null