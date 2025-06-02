#!/bin/bash

echo "Starting Multipass AI Terminal (Refactored)..."
pkill -f "node.*multipass" 2>/dev/null
sleep 1

cd "/mnt/j/DevWorkspace/Active Projects/vibecodes/ship_anywhere_serverside"
node multipass-refactored.js