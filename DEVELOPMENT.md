# Development Guide for Aight

This guide explains how to set up a local development environment for the Aight Home Assistant integration.

## Quick Start

### Option 1: Symlink Method (Recommended for existing HA installations)

If you already have Home Assistant installed locally:

```bash
# Make the setup script executable
chmod +x setup_dev.sh

# Run the setup
./setup_dev.sh

# Follow the prompts to enter your HA config directory
# The script will create symlinks from your code to HA
```

### Option 2: Docker Development (Recommended for isolated testing)

For a clean, isolated development environment:

```bash
# Start Home Assistant in Docker
docker-compose -f docker-compose.dev.yml up

# Access at http://localhost:8123
# Your code is automatically mounted
```

### Option 3: Python Setup Utility

For a guided setup with multiple options:

```bash
python3 dev_setup.py
# Select your preferred method and follow prompts
```

## Development Workflow

### 1. Making Changes

#### Python Code Changes (Backend)
- Edit files in `custom_components/ai_config_assistant/`
- Changes require Home Assistant restart
- Use `./dev-restart.sh` (symlink method) or restart the Docker container

#### JavaScript/Frontend Changes
- Edit files in `custom_components/ai_config_assistant/www/`
- Clear browser cache (Ctrl+Shift+R) to see changes
- No HA restart needed for JS changes
- Panel registration updates require restart

### 2. Testing Your Changes

#### Enable Debug Logging
Add to your `configuration.yaml`:

```yaml
logger:
  default: warning
  logs:
    custom_components.ai_config_assistant: debug
```

#### View Logs
- Symlink method: `./dev-logs.sh`
- Docker method: `docker-compose -f docker-compose.dev.yml logs -f`
- Manual: Check `home-assistant.log` in your config directory

### 3. Common Development Tasks

#### Reload Integration Without Restart
1. Go to Settings → Devices & Services
2. Find "Aight" or "AI Configuration Assistant"
3. Click the 3-dot menu → Reload

#### Test API Endpoints
```python
# Example: Test the generate endpoint
import requests

url = "http://localhost:8123/api/ai_config_assistant/generate"
headers = {
    "Authorization": "Bearer YOUR_LONG_LIVED_TOKEN",
    "Content-Type": "application/json"
}
data = {
    "prompt": "Turn on lights at sunset",
    "type": "automation",
    "entities": ["light.living_room"]
}

response = requests.post(url, json=data, headers=headers)
print(response.json())
```

#### Test WebSocket API
```javascript
// Example: Load conversations
const connection = await hass.connection.sendMessagePromise({
  type: 'ai_config_assistant/load_conversations'
});
console.log(connection);
```

## Project Structure

```
homeassistant-plugin/
├── custom_components/
│   └── ai_config_assistant/        # Integration backend
│       ├── __init__.py             # Integration setup & services
│       ├── api.py                  # REST API endpoints
│       ├── config_flow.py          # Configuration UI flow
│       ├── config_generator.py     # YAML generation logic
│       ├── conversation_agent.py   # HA conversation agent integration
│       ├── conversation_storage.py # User conversation persistence
│       ├── entity_manager.py       # Entity handling & preview
│       ├── llm_client.py          # Multi-LLM provider interface
│       ├── panel.py               # Frontend panel registration
│       ├── websocket_api.py       # WebSocket endpoints
│       ├── const.py               # Constants & configuration
│       ├── manifest.json          # Integration metadata
│       ├── services.yaml          # Service definitions
│       ├── strings.json           # UI strings (English)
│       ├── translations/
│       │   └── en.json           # Translation strings
│       └── www/
│           └── ai-config-panel.js # Frontend application
├── tests/                         # Test files
├── docker-compose.dev.yml         # Docker development setup
├── setup_dev.sh                   # Symlink setup script
├── dev_setup.py                   # Python setup utility
├── dev-start.sh                   # Start HA development
├── dev-stop.sh                    # Stop HA development
├── dev-restart.sh                 # Restart HA development
├── dev-logs.sh                    # View HA logs
└── dev-clean.sh                   # Clean development environment
```

## Key Components

### Backend Components

#### 1. Integration Core (`__init__.py`)
- Service registration and handling
- Integration setup and teardown
- Human-readable ID generation
- Auto-labeling functionality
- Deployment to database or YAML

#### 2. LLM Client (`llm_client.py`)
- Multi-provider support (OpenAI, Anthropic, Google, Mistral, Groq, Ollama, OpenRouter)
- Error handling and retry logic
- Token management
- Response parsing

#### 3. Config Generator (`config_generator.py`)
- YAML generation from prompts
- Entity context injection
- Configuration validation
- Multiple configuration types support

#### 4. Conversation Storage (`conversation_storage.py`)
- User-specific conversation persistence
- Home Assistant Store integration
- Cross-device synchronization
- Migration from localStorage

#### 5. WebSocket API (`websocket_api.py`)
- Real-time conversation management
- CRUD operations for conversations
- User authentication
- Migration endpoints

#### 6. Entity Manager (`entity_manager.py`)
- Entity discovery and caching
- Smart filtering by domain
- Location-based detection
- State and attribute retrieval

### Frontend Components

#### Main Panel (`ai-config-panel.js`)
- Custom element registration
- Chat interface implementation
- Slash command system
- Entity autocomplete
- Conversation sidebar
- Deployment options (database/YAML)
- Real-time WebSocket communication

### Configuration Flow

1. **Setup Wizard** (`config_flow.py`)
   - Choose conversation agent or direct LLM
   - Configure API credentials
   - Set auto-labeling preferences
   - Advanced settings (temperature, tokens)

2. **Options Flow**
   - Update configuration after setup
   - Change auto-label settings
   - Adjust AI parameters

## Feature Implementation Details

### Slash Commands
Commands are processed in the frontend and converted to natural language:
- `/automation` → "Create an automation that [user input]"
- `/scene` → "Create a scene that [user input]"
- `/script` → "Create a script that [user input]"
- `/dashboard` → "Create a dashboard that [user input]"
- `/template` → "Create a template sensor that [user input]"
- `/helper` → "Create a helper entity that [user input]"

### Auto-Labeling System
1. User configures label in setup (default: "AIGHT")
2. Label created with star-shooting-outline icon
3. Applied to entities after deployment
4. Retry mechanism for timing issues

### Human-Readable IDs
1. Extract base text from alias/name
2. Clean and format (remove special chars, convert to snake_case)
3. Check for collisions with existing entities
4. Add numeric suffix if needed
5. Fallback to timestamp if all else fails

### Conversation Sync
1. WebSocket connection established on panel load
2. Conversations loaded from server storage
3. Auto-migration from localStorage if present
4. Changes saved automatically with debouncing
5. User-specific storage (50 conversation limit)

### Entity Detection
1. Parse user prompt for keywords
2. Detect relevant domains (light, switch, sensor, etc.)
3. Location-based filtering (room names)
4. Limit to 100 entities for performance
5. Pass filtered list to LLM

## API Reference

### REST Endpoints

#### `/api/ai_config_assistant/generate`
Generate configuration from natural language.

**Request:**
```json
{
  "prompt": "Turn on lights when motion detected",
  "type": "automation",
  "entities": ["light.living_room", "binary_sensor.motion"],
  "context": {}
}
```

**Response:**
```json
{
  "success": true,
  "config": "alias: Motion Lights\n...",
  "explanation": "This automation will...",
  "entities_used": ["light.living_room"]
}
```

#### `/api/ai_config_assistant/validate`
Validate YAML configuration.

#### `/api/ai_config_assistant/preview`
Preview configuration with live data.

#### `/api/ai_config_assistant/entity_suggestions`
Get entity autocomplete suggestions.

### WebSocket Endpoints

#### `ai_config_assistant/load_conversations`
Load user's conversation history.

#### `ai_config_assistant/save_conversation`
Save or update a conversation.

#### `ai_config_assistant/delete_conversation`
Delete a conversation.

#### `ai_config_assistant/migrate_conversations`
Migrate conversations from localStorage.

### Service Calls

#### `ai_config_assistant.generate_config`
Generate configuration via service call.

#### `ai_config_assistant.deploy_config`
Deploy configuration to Home Assistant.

#### `ai_config_assistant.validate_config`
Validate configuration syntax.

## Debugging Tips

### 1. Integration Not Loading
- Check `home-assistant.log` for errors
- Verify `manifest.json` is valid JSON
- Ensure all Python dependencies are installed
- Check file permissions

### 2. Frontend Not Updating
- Clear browser cache completely
- Check browser console for JavaScript errors
- Verify panel registration in logs
- Check network tab for 404 errors

### 3. API Errors
- Enable debug logging to see full stack traces
- Check service response in logs
- Verify API key is set correctly
- Test with curl or Postman

### 4. LLM Provider Issues
- Verify API keys are correct
- Check rate limits and quotas
- Test provider directly with curl
- Look for specific error messages in logs

### 5. Conversation Storage Issues
- Check WebSocket connection in browser console
- Verify user is authenticated (not bypass login)
- Check Store files in `.storage/` directory
- Monitor WebSocket messages in browser DevTools

### 6. Entity Detection Problems
- Check entity cache is populated
- Verify domain detection logic
- Test with smaller entity sets
- Check filtering in debug logs

## Testing

### Unit Tests
```bash
# Run all tests
python -m pytest tests/

# Run specific test file
python -m pytest tests/test_config_generator.py

# Run with coverage
python -m pytest --cov=custom_components.ai_config_assistant tests/
```

### Integration Tests
```bash
# Test service calls
python tests/test_services.py

# Test WebSocket API
python tests/test_websocket.py
```

### Manual Testing Checklist
- [ ] Configuration flow completes successfully
- [ ] Chat interface loads and responds
- [ ] Slash commands work correctly
- [ ] Entity autocomplete functions
- [ ] Configurations deploy to database
- [ ] YAML export downloads properly
- [ ] Conversations save and load
- [ ] Cross-device sync works
- [ ] Auto-labeling applies correctly
- [ ] Human-readable IDs generate properly

## Best Practices

1. **Always test in development first** - Don't test directly on your production HA instance

2. **Use version control** - Commit your changes frequently

3. **Write tests** - Add tests for new functionality

4. **Follow HA guidelines** - Review [Home Assistant developer docs](https://developers.home-assistant.io/)

5. **Document changes** - Update README and docstrings

6. **Handle errors gracefully** - Always include try/catch blocks

7. **Log appropriately** - Use debug for development, info for important events, warning for issues

8. **Maintain backwards compatibility** - Check HA version when using new features

## Troubleshooting Development Setup

### Symlink Issues

If symlinks aren't working:
```bash
# Remove existing installation
rm -rf ~/homeassistant/custom_components/ai_config_assistant
rm -rf ~/homeassistant/www/ai-config-assistant

# Re-run setup
./setup_dev.sh
```

### Docker Issues

If Docker won't start:
```bash
# Clean up containers
docker-compose -f docker-compose.dev.yml down -v

# Rebuild
docker-compose -f docker-compose.dev.yml build --no-cache
docker-compose -f docker-compose.dev.yml up
```

### Permission Issues

If you get permission errors:
```bash
# Fix permissions (adjust path as needed)
sudo chown -R $USER:$USER ./custom_components
sudo chown -R $USER:$USER ./www
```

## Performance Optimization

### Backend
- Limit entity payload to 100 entities max
- Use caching for entity discovery
- Implement debouncing for saves
- Batch WebSocket messages when possible

### Frontend
- Lazy load conversation history
- Debounce auto-save (1 second)
- Virtual scrolling for long conversations
- Minimize re-renders with proper state management

## Security Considerations

1. **API Keys** - Never log or expose API keys
2. **User Isolation** - Conversations are user-specific
3. **Input Validation** - Sanitize all user inputs
4. **YAML Safety** - Use safe_load for YAML parsing
5. **WebSocket Auth** - Verify user authentication on all endpoints

## Release Process

1. Update version in `manifest.json`
2. Update version in `README.md`
3. Update changelog in `README.md`
4. Test all features thoroughly
5. Create git tag: `git tag v1.5.0`
6. Push tag: `git push origin v1.5.0`
7. Create GitHub release with notes
8. Upload release assets

## Additional Resources

- [Home Assistant Developer Docs](https://developers.home-assistant.io/)
- [Integration Development](https://developers.home-assistant.io/docs/creating_component_index)
- [Frontend Development](https://developers.home-assistant.io/docs/frontend/)
- [WebSocket API](https://developers.home-assistant.io/docs/api/websocket)
- [Storage Collection](https://developers.home-assistant.io/docs/storage_collection)

## Support

For development questions:
- Open an issue on [GitHub](https://github.com/toml0006/aight/issues)
- Check existing issues for solutions
- Join Home Assistant Discord #devs channel
- Review closed PRs for implementation examples