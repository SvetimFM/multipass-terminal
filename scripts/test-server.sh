#!/bin/bash

# Test script for Ship Anywhere Server
# This script tests the server endpoints with curl

API_URL="http://localhost:3010"
EMAIL="test@example.com"
PASSWORD="testpass123"

echo "🚀 Testing Ship Anywhere Server..."
echo "================================="

# 1. Health check
echo -e "\n1. Health Check"
curl -s $API_URL/health | jq .

# 2. Create account
echo -e "\n2. Creating account..."
SIGNUP_RESPONSE=$(curl -s -X POST $API_URL/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

TOKEN=$(echo $SIGNUP_RESPONSE | jq -r '.token')
USER_ID=$(echo $SIGNUP_RESPONSE | jq -r '.user.id')

if [ "$TOKEN" != "null" ]; then
  echo "✅ Account created successfully"
  echo "Token: ${TOKEN:0:20}..."
else
  echo "Account might already exist, trying login..."
  
  # Try login
  LOGIN_RESPONSE=$(curl -s -X POST $API_URL/api/auth/signin \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")
  
  TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')
  USER_ID=$(echo $LOGIN_RESPONSE | jq -r '.user.id')
  
  if [ "$TOKEN" != "null" ]; then
    echo "✅ Logged in successfully"
  else
    echo "❌ Authentication failed"
    exit 1
  fi
fi

# 3. Create session
echo -e "\n3. Creating session..."
SESSION_RESPONSE=$(curl -s -X POST $API_URL/api/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')

SESSION_ID=$(echo $SESSION_RESPONSE | jq -r '.session.id')
echo "Session ID: $SESSION_ID"

# 4. Get available providers
echo -e "\n4. Getting AI providers..."
curl -s -X GET $API_URL/api/ai/providers \
  -H "Authorization: Bearer $TOKEN" | jq '.providers[] | {id, name}'

# 5. Create a task
echo -e "\n5. Creating AI task..."
TASK_RESPONSE=$(curl -s -X POST $API_URL/api/ai/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"command\": \"Write a hello world function in Python\",
    \"provider\": \"claude-code\"
  }")

TASK_ID=$(echo $TASK_RESPONSE | jq -r '.task.id')
echo "Task ID: $TASK_ID"

# 6. Check task status
echo -e "\n6. Checking task status..."
sleep 2
curl -s -X GET $API_URL/api/ai/tasks/$TASK_ID \
  -H "Authorization: Bearer $TOKEN" | jq '.task | {id, status, provider}'

# 7. Get user instances
echo -e "\n7. Getting user AI instances..."
curl -s -X GET $API_URL/api/ai/instances \
  -H "Authorization: Bearer $TOKEN" | jq '.instances'

# 8. Get queue stats
echo -e "\n8. Getting queue statistics..."
curl -s -X GET $API_URL/api/ai/stats \
  -H "Authorization: Bearer $TOKEN" | jq '.stats'

# 9. Get user's tasks
echo -e "\n9. Getting user's recent tasks..."
curl -s -X GET $API_URL/api/ai/tasks?limit=5 \
  -H "Authorization: Bearer $TOKEN" | jq '.tasks[] | {id, command, status, provider}'

echo -e "\n✅ All tests completed!"
echo "================================="
echo -e "\nTo test WebSocket connection, run:"
echo "wscat -c ws://localhost:3011 -x '{\"type\":\"auth\",\"payload\":{\"token\":\"$TOKEN\"},\"messageId\":\"test\",\"timestamp\":\"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'\"}'\"
"