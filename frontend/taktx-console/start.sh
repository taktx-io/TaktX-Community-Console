#!/bin/bash
# TaktX Community Console - Frontend Quick Start Script

echo "🚀 Starting TaktX Console..."
echo ""

# Check if platform service is running
echo "📡 Checking Platform Service..."
if curl -s http://localhost:8080/health/ready > /dev/null; then
    echo "✅ Platform Service is running on http://localhost:8080"
else
    echo "❌ Platform Service is NOT running!"
    echo "   Start it with: cd ../../../backend && ./gradlew :platform-service:quarkusDev"
    exit 1
fi

echo ""
echo "🎨 Starting frontend..."
npm run dev

