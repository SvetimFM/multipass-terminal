#!/bin/bash

echo "🚀 Ship Anywhere - Simple Demo"
echo "=============================="
echo ""

# Kill any existing processes on our ports
echo "🧹 Cleaning up old processes..."
lsof -ti:3010 | xargs -r kill -9 2>/dev/null
lsof -ti:3011 | xargs -r kill -9 2>/dev/null
lsof -ti:8080 | xargs -r kill -9 2>/dev/null

# Start the enhanced server (with AI capabilities)
echo "🖥️  Starting server..."
node simple-ai-executor.js &
SERVER_PID=$!

# Wait a moment for server to start
sleep 2

# Start the client web server
echo "📱 Starting client..."
cd client
python3 -m http.server 8080 &
CLIENT_PID=$!

# Get IP address for mobile access
IP=$(hostname -I | awk '{print $1}')

echo ""
echo "✅ Everything is running!"
echo ""
echo "🖥️  Desktop: http://localhost:8080/simple.html"
echo "📱 Mobile:  http://$IP:8080/simple.html"
echo ""
echo "Press Ctrl+C to stop everything"

# Wait for Ctrl+C
trap "echo ''; echo '🛑 Shutting down...'; kill $SERVER_PID $CLIENT_PID 2>/dev/null; exit" INT

# Keep script running
while true; do
  sleep 1
done