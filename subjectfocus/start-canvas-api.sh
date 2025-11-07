#!/bin/bash

# Canvas Dump API Startup Script

# Load environment variables if .env exists
if [ -f .env ]; then
    echo "Loading environment from .env..."
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if token.txt exists
if [ ! -f token.txt ]; then
    echo "ERROR: token.txt not found!"
    echo "Create token.txt with your Canvas API token first."
    echo "Get your token from: https://nulondon.instructure.com/profile/settings"
    exit 1
fi

# Check if uvicorn is installed
if ! command -v uvicorn &> /dev/null; then
    echo "ERROR: uvicorn not found!"
    echo "Install dependencies first: pip install -r requirements-canvas-api.txt"
    exit 1
fi

# Default values
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
WORKERS="${WORKERS:-1}"

echo "Starting Canvas Dump API..."
echo "Host: $HOST"
echo "Port: $PORT"
echo "Workers: $WORKERS"
echo ""
echo "API will be available at: http://localhost:$PORT"
echo "API docs: http://localhost:$PORT/docs"
echo ""

if [ -z "$SUBJECTFOCUS_API_KEY" ]; then
    echo "WARNING: No SUBJECTFOCUS_API_KEY set - running without authentication!"
    echo "Set SUBJECTFOCUS_API_KEY in .env for production use."
    echo ""
fi

# Start the server
if [ "$1" == "--dev" ]; then
    echo "Starting in development mode (auto-reload enabled)..."
    uvicorn appcanvas:app --reload --host "$HOST" --port "$PORT"
else
    echo "Starting in production mode..."
    uvicorn appcanvas:app --host "$HOST" --port "$PORT" --workers "$WORKERS"
fi
