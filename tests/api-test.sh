#!/bin/bash

# Comprehensive API testing script
# Tests all endpoints and validates the interactive flow

set -e

API_URL="http://localhost:3010"
WS_URL="ws://localhost:3011"
EMAIL="test-$(date +%s)@example.com"
PASSWORD="testpass123"

echo "🧪 Ship Anywhere Server API Test Suite"
echo "======================================"
echo "API URL: $API_URL"
echo "WS URL: $WS_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function
test_endpoint() {
    local test_name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local expected_code=$5
    local token=$6
    
    echo -n "Testing: $test_name... "
    
    if [ -n "$token" ]; then
        RESPONSE=$(curl -s -w "\n%{http_code}" -X $method \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $token" \
            -d "$data" \
            "$API_URL$endpoint")
    else
        RESPONSE=$(curl -s -w "\n%{http_code}" -X $method \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$API_URL$endpoint")
    fi
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
    BODY=$(echo "$RESPONSE" | head -n -1)
    
    if [ "$HTTP_CODE" -eq "$expected_code" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $HTTP_CODE)"
        ((TESTS_PASSED++))
        echo "$BODY" > /tmp/last_response.json
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (Expected $expected_code, got $HTTP_CODE)"
        echo "Response: $BODY"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "1. Testing Health Check"
echo "----------------------"
test_endpoint "Health check" "GET" "/health" "" 200

echo -e "\n2. Testing Authentication"
echo "-------------------------"
test_endpoint "Create account" "POST" "/api/auth/signup" \
    "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 201

TOKEN=$(cat /tmp/last_response.json | grep -o '"token":"[^"]*' | cut -d'"' -f4)
USER_ID=$(cat /tmp/last_response.json | grep -o '"id":"[^"]*' | cut -d'"' -f4)

test_endpoint "Login" "POST" "/api/auth/signin" \
    "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" 200

test_endpoint "Get profile" "GET" "/api/auth/profile" "" 200 "$TOKEN"

echo -e "\n3. Testing Sessions"
echo "-------------------"
test_endpoint "Create session" "POST" "/api/sessions" "{}" 201 "$TOKEN"
SESSION_ID=$(cat /tmp/last_response.json | grep -o '"id":"[^"]*' | cut -d'"' -f4)

test_endpoint "Get sessions" "GET" "/api/sessions" "" 200 "$TOKEN"
test_endpoint "Get session" "GET" "/api/sessions/$SESSION_ID" "" 200 "$TOKEN"

echo -e "\n4. Testing AI Providers"
echo "-----------------------"
test_endpoint "Get providers" "GET" "/api/ai/providers" "" 200 "$TOKEN"
test_endpoint "Get instances" "GET" "/api/ai/instances" "" 200 "$TOKEN"
test_endpoint "Get queue stats" "GET" "/api/ai/stats" "" 200 "$TOKEN"

echo -e "\n5. Testing AI Tasks"
echo "-------------------"
test_endpoint "Create AI task" "POST" "/api/ai/tasks" \
    "{\"sessionId\":\"$SESSION_ID\",\"command\":\"Test command\",\"provider\":\"claude-code\"}" \
    201 "$TOKEN"

TASK_ID=$(cat /tmp/last_response.json | grep -o '"id":"[^"]*' | cut -d'"' -f4)

test_endpoint "Get task" "GET" "/api/ai/tasks/$TASK_ID" "" 200 "$TOKEN"
test_endpoint "Get user tasks" "GET" "/api/ai/tasks?limit=5" "" 200 "$TOKEN"

echo -e "\n6. Testing Notifications"
echo "------------------------"
test_endpoint "Get notifications" "GET" "/api/notifications" "" 200 "$TOKEN"

# Create a mock notification for testing
echo '{"notifications":[{"id":"test-notif","requiresResponse":true}]}' > /tmp/last_response.json

test_endpoint "Respond to notification" "POST" "/api/notifications/test-notif/respond" \
    "{\"response\":\"Yes\"}" 404 "$TOKEN"  # 404 because it's a mock

echo -e "\n7. Testing Billing"
echo "------------------"
test_endpoint "Get plans" "GET" "/api/billing/plans" "" 200

echo -e "\n8. Testing WebSocket Connection"
echo "--------------------------------"
echo -n "Testing WebSocket auth... "

# Create a simple WebSocket test
cat > /tmp/ws-test.js << 'EOF'
const WebSocket = require('ws');
const ws = new WebSocket(process.argv[2]);
const token = process.argv[3];

ws.on('open', () => {
    ws.send(JSON.stringify({
        type: 'auth',
        payload: { token },
        messageId: 'test-auth',
        timestamp: new Date()
    }));
});

ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'auth' && msg.payload.success) {
        console.log('SUCCESS');
        process.exit(0);
    } else if (msg.type === 'error') {
        console.log('FAILED:', msg.payload.message);
        process.exit(1);
    }
});

ws.on('error', (err) => {
    console.log('ERROR:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.log('TIMEOUT');
    process.exit(1);
}, 5000);
EOF

if command -v node > /dev/null && [ -f "node_modules/ws/index.js" ]; then
    WS_RESULT=$(node /tmp/ws-test.js "$WS_URL" "$TOKEN" 2>&1)
    if [ "$WS_RESULT" = "SUCCESS" ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC} ($WS_RESULT)"
        ((TESTS_FAILED++))
    fi
else
    echo -e "SKIPPED (ws module not found)"
fi

echo -e "\n9. Testing Error Handling"
echo "-------------------------"
test_endpoint "Invalid auth" "GET" "/api/sessions" "" 401 "invalid-token"
test_endpoint "Not found" "GET" "/api/ai/tasks/invalid-id" "" 404 "$TOKEN"
test_endpoint "Bad request" "POST" "/api/ai/tasks" "{}" 400 "$TOKEN"

echo -e "\n======================================"
echo "Test Results:"
echo -e "  Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "  Failed: ${RED}$TESTS_FAILED${NC}"
echo "======================================"

# Cleanup
rm -f /tmp/last_response.json /tmp/ws-test.js

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed!${NC}"
    exit 1
fi