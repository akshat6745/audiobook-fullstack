#!/bin/bash

# Start the Python backend server
echo "Starting Python backend server..."
cd python-backend
python main.py &
BACKEND_PID=$!
echo "Backend server started with PID: $BACKEND_PID"

# Give the backend a moment to start
sleep 2

# Start the React Native app
echo "Starting React Native app..."
cd ../AudiobookApp
npm start

# When the React Native app is terminated, also kill the backend
kill $BACKEND_PID
echo "Backend server terminated." 