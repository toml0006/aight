#!/bin/bash

# Development setup script for Aight - AI Configuration Assistant
# This script sets up symlinks for local development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Aight Development Setup${NC}"
echo "=========================="
echo ""

# Check if we're in the right directory
if [ ! -f "custom_components/ai_config_assistant/manifest.json" ]; then
    echo -e "${RED}Error: Please run this script from the project root directory${NC}"
    exit 1
fi

# Get Home Assistant config directory
echo -e "${YELLOW}Please enter your Home Assistant configuration directory path:${NC}"
echo "Examples:"
echo "  - Docker: /path/to/homeassistant/config"
echo "  - Home Assistant OS: /config (if running inside container)"
echo "  - Local install: ~/.homeassistant"
echo ""
read -p "Path: " HA_CONFIG_DIR

# Expand tilde if present
HA_CONFIG_DIR="${HA_CONFIG_DIR/#\~/$HOME}"

# Check if directory exists
if [ ! -d "$HA_CONFIG_DIR" ]; then
    echo -e "${RED}Error: Directory $HA_CONFIG_DIR does not exist${NC}"
    exit 1
fi

# Check if it looks like a Home Assistant config directory
if [ ! -f "$HA_CONFIG_DIR/configuration.yaml" ]; then
    echo -e "${YELLOW}Warning: configuration.yaml not found in $HA_CONFIG_DIR${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create custom_components directory if it doesn't exist
CUSTOM_COMPONENTS_DIR="$HA_CONFIG_DIR/custom_components"
if [ ! -d "$CUSTOM_COMPONENTS_DIR" ]; then
    echo "Creating custom_components directory..."
    mkdir -p "$CUSTOM_COMPONENTS_DIR"
fi

# Create www directory if it doesn't exist
WWW_DIR="$HA_CONFIG_DIR/www"
if [ ! -d "$WWW_DIR" ]; then
    echo "Creating www directory..."
    mkdir -p "$WWW_DIR"
fi

# Get absolute path of current directory
PROJECT_DIR="$(pwd)"

# Remove existing installation if it exists
INTEGRATION_DIR="$CUSTOM_COMPONENTS_DIR/ai_config_assistant"
if [ -e "$INTEGRATION_DIR" ]; then
    echo "Removing existing installation..."
    rm -rf "$INTEGRATION_DIR"
fi

AI_CONFIG_WWW="$WWW_DIR/ai-config-assistant"
if [ -e "$AI_CONFIG_WWW" ]; then
    echo "Removing existing www files..."
    rm -rf "$AI_CONFIG_WWW"
fi

# Create symlinks
echo ""
echo "Creating symlinks..."
ln -s "$PROJECT_DIR/custom_components/ai_config_assistant" "$INTEGRATION_DIR"
echo -e "${GREEN}✓${NC} Linked integration: $INTEGRATION_DIR"

ln -s "$PROJECT_DIR/www/ai-config-assistant" "$AI_CONFIG_WWW"
echo -e "${GREEN}✓${NC} Linked www files: $AI_CONFIG_WWW"

# Save configuration
echo ""
echo "Saving configuration..."
cat > .dev_config <<EOF
HA_CONFIG_DIR="$HA_CONFIG_DIR"
PROJECT_DIR="$PROJECT_DIR"
EOF
echo -e "${GREEN}✓${NC} Configuration saved to .dev_config"

# Create development helper scripts
echo ""
echo "Creating helper scripts..."

# Create restart script
cat > restart_ha.sh <<'EOF'
#!/bin/bash

source .dev_config

echo "Restarting Home Assistant..."

# Try different restart methods
if command -v ha &> /dev/null; then
    ha core restart
elif command -v docker &> /dev/null && docker ps | grep -q homeassistant; then
    docker restart homeassistant
elif command -v systemctl &> /dev/null && systemctl list-units | grep -q home-assistant; then
    sudo systemctl restart home-assistant
else
    echo "Please restart Home Assistant manually"
    echo "Common methods:"
    echo "  - Docker: docker restart homeassistant"
    echo "  - Systemd: sudo systemctl restart home-assistant"
    echo "  - Supervisor: ha core restart"
fi
EOF
chmod +x restart_ha.sh

# Create reload script
cat > reload_integration.sh <<'EOF'
#!/bin/bash

source .dev_config

echo "Reloading Aight integration..."
echo "Note: This requires the integration to be already loaded"
echo ""
echo "You can reload the integration from Home Assistant UI:"
echo "1. Go to Settings → Devices & Services"
echo "2. Find 'Aight' or 'AI Configuration Assistant'"
echo "3. Click the 3-dot menu → Reload"
echo ""
echo "Or restart Home Assistant with: ./restart_ha.sh"
EOF
chmod +x reload_integration.sh

# Create logs script
cat > view_logs.sh <<'EOF'
#!/bin/bash

source .dev_config

LOG_FILE="$HA_CONFIG_DIR/home-assistant.log"

if [ -f "$LOG_FILE" ]; then
    echo "Tailing Home Assistant logs (Ctrl+C to stop)..."
    echo "Filtering for ai_config_assistant messages..."
    echo ""
    tail -f "$LOG_FILE" | grep --line-buffered "ai_config_assistant"
else
    echo "Log file not found at: $LOG_FILE"
    echo ""
    echo "Try one of these commands:"
    echo "  - Docker: docker logs -f homeassistant"
    echo "  - Journalctl: journalctl -f -u home-assistant@homeassistant"
    echo "  - Supervisor: ha core logs -f"
fi
EOF
chmod +x view_logs.sh

# Create sync script for when you make changes
cat > sync_changes.sh <<'EOF'
#!/bin/bash

source .dev_config

echo "Syncing changes..."
echo ""

# Check if symlinks are still valid
if [ ! -L "$HA_CONFIG_DIR/custom_components/ai_config_assistant" ]; then
    echo "Recreating integration symlink..."
    ln -s "$PROJECT_DIR/custom_components/ai_config_assistant" "$HA_CONFIG_DIR/custom_components/ai_config_assistant"
fi

if [ ! -L "$HA_CONFIG_DIR/www/ai-config-assistant" ]; then
    echo "Recreating www symlink..."
    ln -s "$PROJECT_DIR/www/ai-config-assistant" "$HA_CONFIG_DIR/www/ai-config-assistant"
fi

echo "Changes synced. You may need to:"
echo "1. Restart Home Assistant for Python changes: ./restart_ha.sh"
echo "2. Clear browser cache for frontend changes (Ctrl+Shift+R)"
EOF
chmod +x sync_changes.sh

echo -e "${GREEN}✓${NC} Created helper scripts"

# Instructions
echo ""
echo -e "${GREEN}Setup Complete!${NC}"
echo ""
echo "Development environment is ready. Your local files are now linked to Home Assistant."
echo ""
echo "Helper scripts created:"
echo "  • ${GREEN}./restart_ha.sh${NC} - Restart Home Assistant"
echo "  • ${GREEN}./reload_integration.sh${NC} - Instructions to reload the integration"
echo "  • ${GREEN}./view_logs.sh${NC} - View filtered logs for ai_config_assistant"
echo "  • ${GREEN}./sync_changes.sh${NC} - Verify symlinks are intact"
echo ""
echo "Development workflow:"
echo "1. Make changes to your code"
echo "2. For Python changes: Run ${GREEN}./restart_ha.sh${NC}"
echo "3. For frontend changes: Clear browser cache (Ctrl+Shift+R)"
echo "4. Test your changes in Home Assistant"
echo ""
echo "To enable debug logging, add this to your configuration.yaml:"
echo ""
echo "logger:"
echo "  default: warning"
echo "  logs:"
echo "    custom_components.ai_config_assistant: debug"
echo ""
echo "Next step: Restart Home Assistant to load the development version"