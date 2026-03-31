#!/bin/bash
# Force Keycloak to re-import the realm configuration

set -e

echo "🔄 Force re-importing Keycloak realm configuration..."
echo ""

# Step 1: Stop Keycloak
echo "1️⃣ Stopping Keycloak..."
docker-compose stop keycloak

# Step 2: Remove Keycloak data volume to force fresh import
echo "2️⃣ Removing Keycloak data volume..."
docker volume rm docker_keycloak-data 2>/dev/null || echo "Volume already removed or doesn't exist"

# Step 3: Start Keycloak (will trigger import)
echo "3️⃣ Starting Keycloak with fresh import..."
docker-compose up -d keycloak

# Step 4: Wait for Keycloak to be ready
echo "4️⃣ Waiting for Keycloak to start..."
echo "   This may take 30-60 seconds..."

for i in {1..60}; do
  if curl -s http://localhost:8180/health/ready | grep -q "UP\|200"; then
    echo "   ✅ Keycloak is ready!"
    break
  fi
  echo -n "."
  sleep 2
done

echo ""
echo "5️⃣ Verifying realm import..."

# Check if realm exists
REALM_CHECK=$(curl -s http://localhost:8180/realms/taktx/.well-known/openid-configuration | jq -r '.issuer' 2>/dev/null || echo "failed")

if [[ "$REALM_CHECK" == "http://localhost:8180/realms/taktx" ]]; then
  echo "   ✅ Realm 'taktx' imported successfully!"
else
  echo "   ❌ Realm import failed or still loading..."
  echo "   Please wait a bit longer and check manually at: http://localhost:8180"
  exit 1
fi

echo ""
echo "✅ Keycloak realm re-imported successfully!"
echo ""
echo "📋 Test Users Available:"
echo "   • admin@taktx.local (password: changeme) - system-admin role"
echo "   • infra-admin@taktx.local (password: changeme) - infrastructure-admin role"
echo "   • infra-viewer@taktx.local (password: changeme) - infrastructure-viewer role"
echo "   • process-admin@taktx.local (password: changeme) - process-admin role"
echo "   • operator@taktx.local (password: changeme) - process-operator role"
echo "   • viewer@taktx.local (password: changeme) - process-viewer role"
echo ""
echo "🔗 Keycloak Admin Console: http://localhost:8180"
echo "   Username: admin"
echo "   Password: admin"
echo ""

