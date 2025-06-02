#!/bin/bash

echo "Starting Claude Manager (No Auth)..."
pkill -f "node.*claude-manager" 2>/dev/null
sleep 1

cd "/mnt/j/DevWorkspace/Active Projects/vibecodes/ship_anywhere_serverside"
node claude-manager-noauth.js