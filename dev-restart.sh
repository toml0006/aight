#!/bin/bash

# Restart Home Assistant in Docker (for testing Python changes)

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${YELLOW}Restarting Home Assistant...${NC}"

# Just restart the Home Assistant container
docker compose -f docker-compose.dev.yml restart homeassistant

echo -e "${BLUE}Waiting for Home Assistant to be ready...${NC}"

# Wait a moment for the restart
sleep 5

# Check if Home Assistant is responding
MAX_ATTEMPTS=15
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8123 | grep -q "200\|401"; then
        echo -e "${GREEN}✓${NC} Home Assistant is ready!"
        break
    fi
    echo -n "."
    sleep 2
    ATTEMPT=$((ATTEMPT + 1))
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo -e "\n${YELLOW}⚠️  Home Assistant may still be starting${NC}"
    echo "Check logs with: ./dev-logs.sh"
else
    echo ""
    echo -e "${GREEN}✅ Restart complete!${NC}"
    echo "Access at: http://localhost:8123"
fi