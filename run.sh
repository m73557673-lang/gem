#!/usr/bin/env bash
set -e

echo "Starting Autonomous AI-Powered Incident Commander..."

# Install python requirements if pip is available
if command -v pip &> /dev/null; then
    echo "Installing Python dependencies from requirements.txt..."
    pip install -q -r requirements.txt
elif command -v pip3 &> /dev/null; then
    echo "Installing Python dependencies from requirements.txt..."
    pip3 install -q -r requirements.txt
fi

# If node_modules does not exist, run npm install
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# Launch backend in background if python3 is ready
if python3 -c "import fastapi" &> /dev/null; then
    echo "Starting FastAPI backend on port 8000..."
    python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
    BACKEND_PID=$!
    trap "kill $BACKEND_PID" EXIT
fi

# Run the dev server on port 3000
echo "Starting Vite Dev Server on port 3000..."
npm run dev
