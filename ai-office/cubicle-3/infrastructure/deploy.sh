#!/bin/bash
set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CDK_DIR="$SCRIPT_DIR/cdk"

# Default values
ENVIRONMENT="dev"
REGION="us-east-1"
PROFILE="default"
SKIP_BUILD=false
SKIP_TESTS=false
DEPLOY_ALL=false
DESTROY=false

# Usage function
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Environment to deploy (dev|staging|prod) [default: dev]"
    echo "  -r, --region REGION      AWS region [default: us-east-1]"
    echo "  -p, --profile PROFILE    AWS profile [default: default]"
    echo "  -s, --stack STACK        Specific stack to deploy (core|auth|api|compute|ai|billing|monitoring)"
    echo "  -a, --all                Deploy all stacks"
    echo "  --skip-build             Skip building Lambda functions"
    echo "  --skip-tests             Skip running tests"
    echo "  --destroy                Destroy stacks instead of deploying"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e prod -r us-west-2 --all"
    echo "  $0 -e dev -s core"
    echo "  $0 -e staging --destroy -s api"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -p|--profile)
            PROFILE="$2"
            shift 2
            ;;
        -s|--stack)
            STACK="$2"
            shift 2
            ;;
        -a|--all)
            DEPLOY_ALL=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --destroy)
            DESTROY=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    echo -e "${RED}Invalid environment: $ENVIRONMENT${NC}"
    echo "Environment must be one of: dev, staging, prod"
    exit 1
fi

# Validate stack if specified
if [[ -n "${STACK:-}" ]] && [[ ! "$STACK" =~ ^(core|auth|api|compute|ai|billing|monitoring)$ ]]; then
    echo -e "${RED}Invalid stack: $STACK${NC}"
    echo "Stack must be one of: core, auth, api, compute, ai, billing, monitoring"
    exit 1
fi

# Production safety check
if [[ "$ENVIRONMENT" == "prod" ]]; then
    echo -e "${YELLOW}WARNING: You are about to deploy to PRODUCTION!${NC}"
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
fi

# Destroy safety check
if [[ "$DESTROY" == true ]]; then
    echo -e "${RED}WARNING: You are about to DESTROY infrastructure!${NC}"
    echo -e "${RED}Environment: $ENVIRONMENT${NC}"
    echo -e "${RED}Region: $REGION${NC}"
    read -p "Type the environment name to confirm destruction: " confirm
    if [[ "$confirm" != "$ENVIRONMENT" ]]; then
        echo "Destruction cancelled."
        exit 0
    fi
fi

echo -e "${BLUE}=== AI Office Infrastructure Deployment ===${NC}"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "AWS Profile: $PROFILE"
echo ""

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed${NC}"
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm is not installed${NC}"
    exit 1
fi

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}AWS CLI is not installed${NC}"
    exit 1
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker is not installed. Some features may not work.${NC}"
fi

# Verify AWS credentials
echo -e "${BLUE}Verifying AWS credentials...${NC}"
if ! aws sts get-caller-identity --profile "$PROFILE" &> /dev/null; then
    echo -e "${RED}Failed to verify AWS credentials for profile: $PROFILE${NC}"
    exit 1
fi

# Change to CDK directory
cd "$CDK_DIR"

# Install dependencies
echo -e "${BLUE}Installing dependencies...${NC}"
npm ci

# Build Lambda functions
if [[ "$SKIP_BUILD" == false ]]; then
    echo -e "${BLUE}Building Lambda functions...${NC}"
    npm run build:lambda
    
    # Build Lambda layers
    echo -e "${BLUE}Building Lambda layers...${NC}"
    "$SCRIPT_DIR/scripts/build-layers.sh"
    
    # Build Docker images
    if command -v docker &> /dev/null && [[ "$ENVIRONMENT" != "dev" || "$DEPLOY_ALL" == true || "$STACK" == "compute" ]]; then
        echo -e "${BLUE}Building Docker images...${NC}"
        "$SCRIPT_DIR/scripts/build-docker.sh" "$ENVIRONMENT"
    fi
fi

# Run tests
if [[ "$SKIP_TESTS" == false ]]; then
    echo -e "${BLUE}Running tests...${NC}"
    npm test
fi

# Bootstrap CDK (if needed)
echo -e "${BLUE}Bootstrapping CDK...${NC}"
npx cdk bootstrap "aws://$AWS_ACCOUNT_ID/$REGION" \
    --profile "$PROFILE" \
    -c environment="$ENVIRONMENT" || true

# Synthesize stacks
echo -e "${BLUE}Synthesizing CDK stacks...${NC}"
npx cdk synth -c environment="$ENVIRONMENT" --profile "$PROFILE"

# Define stack order for dependencies
STACK_ORDER=(
    "core-infrastructure"
    "authentication"
    "api"
    "compute"
    "ai-integration"
    "billing"
    "monitoring"
)

# Map stack names
declare -A STACK_MAP=(
    ["core"]="core-infrastructure"
    ["auth"]="authentication"
    ["api"]="api"
    ["compute"]="compute"
    ["ai"]="ai-integration"
    ["billing"]="billing"
    ["monitoring"]="monitoring"
)

# Determine which stacks to deploy
STACKS_TO_DEPLOY=()
if [[ "$DEPLOY_ALL" == true ]]; then
    STACKS_TO_DEPLOY=("${STACK_ORDER[@]}")
elif [[ -n "${STACK:-}" ]]; then
    STACKS_TO_DEPLOY=("${STACK_MAP[$STACK]}")
else
    echo -e "${RED}No stack specified. Use -s STACK or -a for all stacks.${NC}"
    exit 1
fi

# Deploy or destroy stacks
for stack in "${STACKS_TO_DEPLOY[@]}"; do
    stack_name="ai-office-$ENVIRONMENT-$stack"
    
    if [[ "$DESTROY" == true ]]; then
        echo -e "${RED}Destroying stack: $stack_name${NC}"
        npx cdk destroy "$stack_name" \
            --profile "$PROFILE" \
            -c environment="$ENVIRONMENT" \
            --force
    else
        echo -e "${GREEN}Deploying stack: $stack_name${NC}"
        npx cdk deploy "$stack_name" \
            --profile "$PROFILE" \
            -c environment="$ENVIRONMENT" \
            --require-approval never \
            --outputs-file "outputs/$ENVIRONMENT-$stack.json"
    fi
done

# Post-deployment tasks
if [[ "$DESTROY" == false ]]; then
    echo -e "${BLUE}Running post-deployment tasks...${NC}"
    
    # Update secrets if in production
    if [[ "$ENVIRONMENT" == "prod" ]]; then
        echo -e "${YELLOW}Remember to update the following secrets:${NC}"
        echo "  - AI provider API keys (Anthropic, OpenAI)"
        echo "  - Stripe API keys and webhook secret"
        echo "  - Slack webhook URL for monitoring"
    fi
    
    # Output important URLs
    if [[ -f "outputs/$ENVIRONMENT-api.json" ]]; then
        echo -e "${GREEN}Deployment complete!${NC}"
        echo ""
        echo -e "${BLUE}Important URLs:${NC}"
        
        API_URL=$(jq -r '.["ai-office-'$ENVIRONMENT'-api"].RestApiUrl' "outputs/$ENVIRONMENT-api.json" 2>/dev/null || echo "N/A")
        WS_URL=$(jq -r '.["ai-office-'$ENVIRONMENT'-api"].WebSocketApiUrl' "outputs/$ENVIRONMENT-api.json" 2>/dev/null || echo "N/A")
        APP_URL=$(jq -r '.["ai-office-'$ENVIRONMENT'-api"].AppUrl' "outputs/$ENVIRONMENT-api.json" 2>/dev/null || echo "N/A")
        
        echo "  REST API: $API_URL"
        echo "  WebSocket: $WS_URL"
        if [[ "$APP_URL" != "N/A" ]]; then
            echo "  Application: $APP_URL"
        fi
    fi
    
    # Create deployment record
    DEPLOYMENT_RECORD="$SCRIPT_DIR/deployments/$ENVIRONMENT-$(date +%Y%m%d-%H%M%S).json"
    mkdir -p "$SCRIPT_DIR/deployments"
    
    echo "{
        \"environment\": \"$ENVIRONMENT\",
        \"region\": \"$REGION\",
        \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
        \"stacks\": $(echo "${STACKS_TO_DEPLOY[@]}" | jq -R -s -c 'split(" ")'),
        \"git_commit\": \"$(git rev-parse HEAD 2>/dev/null || echo "unknown")\",
        \"deployer\": \"$(whoami)\"
    }" | jq '.' > "$DEPLOYMENT_RECORD"
    
    echo ""
    echo -e "${GREEN}Deployment record saved to: $DEPLOYMENT_RECORD${NC}"
fi

echo -e "${GREEN}Done!${NC}"