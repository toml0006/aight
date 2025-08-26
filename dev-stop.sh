#!/bin/bash

# Stop the Docker development environment

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Stopping Aight development environment...${NC}"

docker compose -f docker-compose.dev.yml down

echo -e "${GREEN}✓${NC} Development environment stopped"
echo ""
echo "Your configuration and data are preserved in dev-config/"
echo "Run ./dev-start.sh to start again"