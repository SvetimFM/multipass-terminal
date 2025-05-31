#!/bin/bash

echo "🌐 Starting Ship Anywhere Client..."
echo "==================================="

cd client

# Check if Python 3 is available
if command -v python3 &> /dev/null; then
    echo "📱 Starting web server on http://localhost:8080"
    echo ""
    echo "Access from:"
    echo "  • Computer: http://localhost:8080"
    echo "  • Mobile: http://$(hostname -I | awk '{print $1}'):8080"
    echo ""
    python3 -m http.server 8080
elif command -v npx &> /dev/null; then
    echo "📱 Starting web server on http://localhost:8080"
    echo ""
    echo "Access from:"
    echo "  • Computer: http://localhost:8080"
    echo "  • Mobile: http://$(hostname -I | awk '{print $1}'):8080"
    echo ""
    npx http-server -p 8080
else
    echo "❌ No web server found. Install Python 3 or Node.js"
    exit 1
fi