#!/bin/bash

# Increase system file descriptor limit temporarily
ulimit -n 10240

# Set environment variables to reduce file watching
export WATCHMAN_DONT_FOLLOW_MOUNTS=true
export WATCHMAN_SOCK_NO_FSEVENTS=1
export NODE_OPTIONS="--max-old-space-size=4096"
export EXPO_USE_DEV_SERVER=true

# Start the app in production mode with reduced watching
npx expo start --no-dev --minify 