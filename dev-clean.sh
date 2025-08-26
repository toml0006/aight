#!/bin/bash

# Clean reset of the development environment (removes all data)

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${RED}⚠️  WARNING: Clean Reset${NC}"
echo "========================"
echo ""
echo "This will:"
echo "  • Stop all containers"
echo "  • Remove all Home Assistant data"
echo "  • Delete configuration (except configuration.yaml)"
echo "  • Require re-onboarding and re-adding the integration"
echo ""
read -p "Are you sure you want to continue? (yes/no): " -r

if [ "$REPLY" != "yes" ]; then
    echo "Cancelled"
    exit 0
fi

echo ""
echo -e "${YELLOW}Stopping containers...${NC}"
docker compose -f docker-compose.dev.yml down -v

echo -e "${YELLOW}Cleaning development data...${NC}"

# Remove everything except our base config files
cd dev-config
find . -type f -not -name 'configuration.yaml' \
              -not -name 'automations.yaml' \
              -not -name 'scripts.yaml' \
              -not -name 'scenes.yaml' \
              -not -name 'secrets.yaml' \
              -not -path './themes/*' \
              -delete 2>/dev/null || true

# Remove all directories except themes
find . -type d -not -path '.' -not -path './themes' -not -path './themes/*' -exec rm -rf {} + 2>/dev/null || true

cd ..

echo -e "${GREEN}✓${NC} Clean reset complete"
echo ""
echo "Run ./dev-start.sh to start fresh"
echo "You'll need to:"
echo "  1. Complete onboarding again"
echo "  2. Re-add the Aight integration"
echo "  3. Configure your API keys"