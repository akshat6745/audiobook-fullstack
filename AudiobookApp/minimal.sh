#!/bin/bash

# Remove node_modules/.cache to clear any stale cache
echo "Clearing cache..."
rm -rf node_modules/.cache

# Increase system file descriptor limit temporarily
ulimit -n 10240

# Set environment variables to reduce file watching
export WATCHMAN_DONT_FOLLOW_MOUNTS=true
export NODE_OPTIONS="--max-old-space-size=4096"
export EXPO_BUNDLE_MAX_WORKERS=2
export METRO_MAX_WORKERS=2

# Start the app with minimal options - no dev mode, minimal file watching
echo "Starting app with minimal file watching..."
npx expo start --no-dev --minify --max-workers=2 