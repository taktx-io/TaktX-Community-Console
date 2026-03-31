#!/bin/bash
# TaktX Console - Quick Start Script

echo "🚀 Starting TaktX Console..."
echo ""

# Check if backend is running
echo "📡 Checking backend..."
if curl -s http://localhost:8084/processdefinitions > /dev/null; then
    echo "✅ Backend is running on http://localhost:8084"
else
    echo "❌ Backend is NOT running!"
    echo "   Start it with: cd ../../../backend && ./gradlew :ingesters:inmemory:quarkusDev"
    exit 1
fi

echo ""
echo "🎨 Starting frontend..."
npm run dev

