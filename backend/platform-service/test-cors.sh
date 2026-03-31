#!/bin/bash

# CORS Testing Script for Platform Service
# Run this after restarting the Platform Service

echo "=========================================="
echo "CORS Configuration Test"
echo "=========================================="
echo ""

# Test 1: OPTIONS Preflight Request
echo "Test 1: OPTIONS Preflight (CORS Preflight)"
echo "-------------------------------------------"
echo "Command: curl -v -X OPTIONS -H 'Origin: http://localhost:3001' -H 'Access-Control-Request-Method: GET' http://localhost:8080/api/clusters"
echo ""

RESPONSE=$(curl -s -v -X OPTIONS \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-type" \
  "http://localhost:8080/api/clusters" 2>&1)

echo "$RESPONSE" | grep -E "^(>|<)" | head -20

echo ""
echo "Checking for required CORS headers:"
echo ""

# Check each header
if echo "$RESPONSE" | grep -qi "Access-Control-Allow-Origin"; then
  echo "✅ Access-Control-Allow-Origin: $(echo "$RESPONSE" | grep -i "Access-Control-Allow-Origin" | sed 's/^< //')"
else
  echo "❌ Access-Control-Allow-Origin: MISSING"
fi

if echo "$RESPONSE" | grep -qi "Access-Control-Allow-Methods"; then
  echo "✅ Access-Control-Allow-Methods: $(echo "$RESPONSE" | grep -i "Access-Control-Allow-Methods" | sed 's/^< //')"
else
  echo "❌ Access-Control-Allow-Methods: MISSING"
fi

if echo "$RESPONSE" | grep -qi "Access-Control-Allow-Credentials"; then
  echo "✅ Access-Control-Allow-Credentials: $(echo "$RESPONSE" | grep -i "Access-Control-Allow-Credentials" | sed 's/^< //')"
else
  echo "❌ Access-Control-Allow-Credentials: MISSING"
fi

if echo "$RESPONSE" | grep -qi "Access-Control-Allow-Headers"; then
  echo "✅ Access-Control-Allow-Headers: $(echo "$RESPONSE" | grep -i "Access-Control-Allow-Headers" | sed 's/^< //')"
else
  echo "❌ Access-Control-Allow-Headers: MISSING"
fi

echo ""
echo "=========================================="
echo "Test 2: Actual GET Request (with CORS)"
echo "=========================================="
echo ""

RESPONSE2=$(curl -s -v -H "Origin: http://localhost:3001" "http://localhost:8080/api/status" 2>&1)

echo "$RESPONSE2" | grep -E "^(>|<)" | head -15

echo ""
if echo "$RESPONSE2" | grep -qi "Access-Control-Allow-Origin"; then
  echo "✅ GET request has Access-Control-Allow-Origin header"
else
  echo "❌ GET request missing Access-Control-Allow-Origin header"
fi

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="

PREFLIGHT_OK=false
GET_OK=false

if echo "$RESPONSE" | grep -qi "Access-Control-Allow-Origin"; then
  PREFLIGHT_OK=true
fi

if echo "$RESPONSE2" | grep -qi "Access-Control-Allow-Origin"; then
  GET_OK=true
fi

if [ "$PREFLIGHT_OK" = true ] && [ "$GET_OK" = true ]; then
  echo "✅ CORS is working correctly!"
  echo ""
  echo "Next steps:"
  echo "1. Open browser to http://localhost:3001/clusters"
  echo "2. Check browser console for CORS errors (should be none)"
  echo "3. Verify data loads correctly"
else
  echo "❌ CORS is NOT working correctly"
  echo ""
  echo "Troubleshooting:"
  echo "1. Verify Platform Service is running: curl http://localhost:8080/api/status"
  echo "2. Check startup logs for errors"
  echo "3. Verify clean restart was done: ./gradlew clean quarkusDev"
  echo "4. Check application.properties has CORS config"
fi

echo ""

