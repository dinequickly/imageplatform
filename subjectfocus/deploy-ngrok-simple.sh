#!/bin/bash

echo "🚀 Canvas API - Super Simple Ngrok Setup"
echo "========================================"
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ Ngrok not found!"
    echo ""
    echo "📥 Install it:"
    echo "1. Go to: https://ngrok.com/download"
    echo "2. Download for Mac"
    echo "3. Unzip and move ngrok to /usr/local/bin/"
    echo ""
    echo "Or install with Homebrew:"
    echo "   brew install ngrok/ngrok/ngrok"
    exit 1
fi

# Check if token.txt exists
if [ ! -f token.txt ]; then
    echo "❌ token.txt not found!"
    echo "Create token.txt with your Canvas API token first."
    exit 1
fi

# Check if API is running
if ! lsof -i:8000 &> /dev/null; then
    echo "⚠️  API not running on port 8000!"
    echo ""
    echo "Starting the API server..."
    echo ""

    # Start the API in the background
    ./start-canvas-api.sh --dev &
    API_PID=$!

    echo "⏳ Waiting for API to start (5 seconds)..."
    sleep 5
fi

echo "✅ API is running!"
echo ""
echo "🌐 Creating public tunnel with ngrok..."
echo ""
echo "Your public URL will appear below:"
echo "===================================="
echo ""

# Start ngrok
ngrok http 8000
