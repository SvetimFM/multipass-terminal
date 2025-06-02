#!/bin/bash

echo "Starting Multipass AI Terminal..."
pkill -f "node.*multipass" 2>/dev/null
sleep 1

cd "/mnt/j/DevWorkspace/Active Projects/vibecodes/ship_anywhere_serverside"
node multipass.js