#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DOCKER_DIR="$SCRIPT_DIR/../docker"
ENVIRONMENT="${1:-dev}"

echo "Building Docker images for environment: $ENVIRONMENT"

# Get AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# Login to ECR
echo "Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

# Build terminal image
echo "Building terminal image..."
cd "$DOCKER_DIR/terminal"

# Copy package.json for dependencies
cp "$SCRIPT_DIR/../../package.json" .

docker build \
  --platform linux/amd64 \
  -t "ai-office-$ENVIRONMENT-terminal:latest" \
  -t "$ECR_REGISTRY/ai-office-$ENVIRONMENT-terminal:latest" \
  .

# Push to ECR
echo "Pushing terminal image to ECR..."
docker push "$ECR_REGISTRY/ai-office-$ENVIRONMENT-terminal:latest"

# Clean up
rm -f package.json

echo "Docker images built and pushed successfully!"