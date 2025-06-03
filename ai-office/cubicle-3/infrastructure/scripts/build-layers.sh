#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LAMBDA_DIR="$SCRIPT_DIR/../lambda"

echo "Building Lambda layers..."

# Shared layer
echo "Building shared layer..."
SHARED_LAYER_DIR="$LAMBDA_DIR/layers/shared/nodejs"
mkdir -p "$SHARED_LAYER_DIR"

cat > "$SHARED_LAYER_DIR/package.json" << EOF
{
  "name": "shared-layer",
  "version": "1.0.0",
  "dependencies": {
    "@aws-lambda-powertools/logger": "^1.14.0",
    "@aws-lambda-powertools/tracer": "^1.14.0",
    "@aws-lambda-powertools/metrics": "^1.14.0",
    "uuid": "^9.0.0",
    "aws-jwt-verify": "^4.0.0"
  }
}
EOF

cd "$SHARED_LAYER_DIR" && npm install --production

# AI SDK layer
echo "Building AI SDK layer..."
AI_LAYER_DIR="$LAMBDA_DIR/layers/ai-sdk/nodejs"
mkdir -p "$AI_LAYER_DIR"

cat > "$AI_LAYER_DIR/package.json" << EOF
{
  "name": "ai-sdk-layer",
  "version": "1.0.0",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.20.0",
    "openai": "^4.28.0"
  }
}
EOF

cd "$AI_LAYER_DIR" && npm install --production

# Stripe layer
echo "Building Stripe layer..."
STRIPE_LAYER_DIR="$LAMBDA_DIR/layers/stripe/nodejs"
mkdir -p "$STRIPE_LAYER_DIR"

cat > "$STRIPE_LAYER_DIR/package.json" << EOF
{
  "name": "stripe-layer",
  "version": "1.0.0",
  "dependencies": {
    "stripe": "^14.0.0"
  }
}
EOF

cd "$STRIPE_LAYER_DIR" && npm install --production

echo "Lambda layers built successfully!"