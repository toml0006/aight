#!/bin/bash

# Start script for Docker development environment
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Aight Development Environment${NC}"
echo "========================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker is not running${NC}"
    echo "Please start Docker Desktop and try again"
    exit 1
fi

echo -e "${GREEN}✓${NC} Docker is running"

# Check if port 8123 is available
if lsof -Pi :8123 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Port 8123 is already in use${NC}"
    echo "This might be another Home Assistant instance."
    read -p "Do you want to stop it and continue? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Try to stop any existing HA container
        docker stop homeassistant-dev 2>/dev/null || true
    else
        echo "Exiting. Please free up port 8123 or modify docker-compose.dev.yml to use a different port."
        exit 1
    fi
fi

# Create required directories if they don't exist
echo -e "${BLUE}Setting up directories...${NC}"
mkdir -p dev-config
mkdir -p dev-config/themes

# Check if this is first run (no .storage directory)
FIRST_RUN=false
if [ ! -d "dev-config/.storage" ]; then
    FIRST_RUN=true
    echo -e "${YELLOW}📝 First run detected - you'll need to complete onboarding${NC}"
fi

# Pull the latest Home Assistant image
echo -e "${BLUE}Pulling latest Home Assistant image...${NC}"
docker compose -f docker-compose.dev.yml pull

# Start the containers
echo -e "${BLUE}Starting containers...${NC}"
docker compose -f docker-compose.dev.yml up -d

# Wait for Home Assistant to be ready
echo -e "${BLUE}Waiting for Home Assistant to start...${NC}"
sleep 5

# Check if Home Assistant is responding
MAX_ATTEMPTS=30
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
    echo -e "\n${RED}❌ Home Assistant failed to start${NC}"
    echo "Check logs with: docker compose -f docker-compose.dev.yml logs"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Development environment is running!${NC}"
echo ""
echo "========================================"
echo -e "${GREEN}Access Home Assistant at:${NC} ${BLUE}http://localhost:8123${NC}"
echo "========================================"
echo ""

if [ "$FIRST_RUN" = true ]; then
    echo -e "${YELLOW}First-time setup instructions:${NC}"
    echo "1. Open http://localhost:8123 in your browser"
    echo "2. Complete the onboarding process"
    echo "3. Go to Settings → Devices & Services"
    echo "4. Click '+ Add Integration'"
    echo "5. Search for 'Aight' or 'AI Configuration Assistant'"
    echo "6. Follow the setup wizard to add your LLM API key"
    echo ""
fi

echo -e "${BLUE}Useful commands:${NC}"
echo "  View logs:    ./dev-logs.sh"
echo "  Stop:         ./dev-stop.sh"
echo "  Restart:      ./dev-restart.sh"
echo "  Clean reset:  ./dev-clean.sh"
echo ""
echo -e "${YELLOW}Development workflow:${NC}"
echo "1. Make changes to your code"
echo "2. For Python changes: Run ./dev-restart.sh"
echo "3. For frontend changes: Just refresh browser (Ctrl+Shift+R)"
echo "4. Check logs if something goes wrong: ./dev-logs.sh"
echo ""
echo -e "${GREEN}Happy coding! 🎉${NC}"