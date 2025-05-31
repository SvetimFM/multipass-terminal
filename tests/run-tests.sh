#!/bin/bash

echo "🧪 Ship Anywhere Test Suite"
echo "=========================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if dependencies are installed
echo -e "${BLUE}Checking test dependencies...${NC}"
if ! npm list jest supertest > /dev/null 2>&1; then
    echo "Installing test dependencies..."
    npm install --save-dev jest supertest ws puppeteer
fi

# Kill any existing processes on our ports
echo -e "${BLUE}Cleaning up existing processes...${NC}"
lsof -ti:3010 | xargs -r kill -9 2>/dev/null
lsof -ti:3011 | xargs -r kill -9 2>/dev/null
lsof -ti:8080 | xargs -r kill -9 2>/dev/null

# Give processes time to fully shutdown
sleep 2

# Run unit tests
echo ""
echo -e "${BLUE}Running unit tests...${NC}"
echo "====================="
npm test -- tests/simple-server.test.js --verbose

UNIT_RESULT=$?

# Kill processes again before integration tests
lsof -ti:3010 | xargs -r kill -9 2>/dev/null
lsof -ti:3011 | xargs -r kill -9 2>/dev/null
lsof -ti:8080 | xargs -r kill -9 2>/dev/null
sleep 2

# Run integration tests
echo ""
echo -e "${BLUE}Running integration tests...${NC}"
echo "==========================="
npm test -- tests/client-server.test.js --verbose

INTEGRATION_RESULT=$?

# Summary
echo ""
echo "Test Summary"
echo "============"

if [ $UNIT_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ Unit tests passed${NC}"
else
    echo -e "${RED}❌ Unit tests failed${NC}"
fi

if [ $INTEGRATION_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ Integration tests passed${NC}"
else
    echo -e "${RED}❌ Integration tests failed${NC}"
fi

# Cleanup
echo ""
echo -e "${BLUE}Cleaning up...${NC}"
lsof -ti:3010 | xargs -r kill -9 2>/dev/null
lsof -ti:3011 | xargs -r kill -9 2>/dev/null
lsof -ti:8080 | xargs -r kill -9 2>/dev/null

# Exit with appropriate code
if [ $UNIT_RESULT -eq 0 ] && [ $INTEGRATION_RESULT -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}Some tests failed. Please check the output above.${NC}"
    exit 1
fi