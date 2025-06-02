#!/bin/bash

echo "Starting Multipass AI Terminal (Refactored)..."
pkill -f "node.*multipass" 2>/dev/null
sleep 1

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

node multipass-refactored.js