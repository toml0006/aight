#!/bin/bash

# View logs from the Docker development environment

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}📋 Aight Development Logs${NC}"
echo "========================="
echo ""
echo -e "${YELLOW}Showing logs for ai_config_assistant...${NC}"
echo "Press Ctrl+C to stop"
echo ""

# Follow logs and filter for our integration
docker compose -f docker-compose.dev.yml logs -f homeassistant | grep --line-buffered -E "(ai_config_assistant|AI Config|Aight)" --color=always

# If grep exits (no matches), show all logs
if [ $? -ne 0 ]; then
    echo ""
    echo -e "${YELLOW}No integration logs found. Showing all logs...${NC}"
    docker compose -f docker-compose.dev.yml logs -f homeassistant
fi