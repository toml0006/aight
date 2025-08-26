# Aight - AI Configuration Assistant for Home Assistant

🚀 **v1.5.0** - The most advanced Home Assistant AI configuration tool with **cross-device conversation sync**!

📖 **[Documentation & Demo](https://toml0006.github.io/aight/)** | 📦 **[Download Latest](https://github.com/toml0006/aight/releases/latest)** | 💬 **[Community](https://github.com/toml0006/aight/discussions)**

**Aight** is a powerful Home Assistant integration that uses AI to help you create configurations through natural language. No more YAML editing - just chat with the AI and get working configurations instantly!

## ✨ Key Features

💬 **Conversational Chat Interface**: Chat naturally with AI - no forms, no interruptions, just results!

☁️ **Cross-Device Conversation Sync**: Your chat history follows you across all your devices

🏷️ **Auto-Labeling**: Automatically labels all created entities with customizable tags

🤖 **Smart Entity Detection**: Automatically finds relevant entities based on your prompt

⚡ **Slash Commands**: Quick access to configuration types with `/automation`, `/scene`, `/script`, and more

📥 **Flexible Deployment**: Deploy to Home Assistant database or export as YAML files

🎯 **Human-Readable IDs**: Generated configurations use descriptive IDs instead of timestamps

🚀 **One-Click Deployment**: Deploy automations, scripts, and scenes directly to Home Assistant

🔄 **Iterative Refinement**: Say "also turn on the TV" or "but only on weekdays" to modify configurations

🔍 **Multi-LLM Support**: OpenAI, Anthropic Claude, Google Gemini, Groq, Ollama, and OpenRouter

🎨 **Beautiful UI**: Modern, responsive interface with entity autocomplete and syntax highlighting

📱 **Mobile Responsive**: Perfect experience on phones, tablets, and desktops

## Supported Configuration Types

- **Automations**: Create complex automations with triggers, conditions, and actions
- **Scripts**: Build reusable script sequences  
- **Scenes**: Define lighting and device scenes
- **Dashboards**: Generate Lovelace dashboard configurations
- **Cards**: Create individual dashboard cards
- **Template Sensors**: Build template sensors and binary sensors
- **Helpers**: Create input helpers (boolean, number, text, select, datetime, button)

## Installation

### 🚀 Quick Install - Latest Version

[![Download Latest Version](https://img.shields.io/badge/Download-v1.5.0%20Latest-success?style=for-the-badge&logo=homeassistant)](https://github.com/toml0006/aight/releases/latest/download/aight.zip)

**v1.5.0** includes revolutionary new features:
- ☁️ **Cross-device conversation sync** - Chat history follows you everywhere
- 🏷️ **Auto-labeling** - Automatically tag created entities
- ⚡ **Slash commands** - Quick access with `/automation`, `/scene`, etc.
- 📥 **Export to YAML** - Choose between database deployment or file export
- 🎯 **Human-readable IDs** - No more timestamp-based IDs
- 🎨 **Enhanced UI** - Tabs in header, entity autocomplete everywhere

### HACS Installation

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=toml0006&repository=aight&category=integration)

### Method 1: HACS (Recommended)

1. **Install HACS** if you haven't already: [HACS Installation](https://hacs.xyz/docs/setup/download)

2. **Add this repository to HACS:**
   - Open HACS in your Home Assistant instance
   - Go to "Integrations" 
   - Click the "..." menu in the top right
   - Select "Custom repositories"
   - Add this repository URL: `https://github.com/toml0006/aight`
   - Category: "Integration"
   - Click "Add"

3. **Install the integration:**
   - Search for "Aight" or "AI Configuration Assistant" in HACS
   - Click "Download"
   - Restart Home Assistant

### Method 2: Manual Installation

1. Copy the `custom_components/ai_config_assistant` directory to your Home Assistant `custom_components` directory
2. Copy the contents of the `www` directory to your Home Assistant `www` directory
3. Restart Home Assistant

## Configuration

### Step 1: Add the Integration

1. Go to Settings → Devices & Services
2. Click "Add Integration"
3. Search for "Aight" or "AI Configuration Assistant"
4. Follow the setup wizard

### Step 2: Choose Your Setup Method

You have two options:

#### Option A: Use Existing Conversation Agent (Recommended)
If you already have an AI conversation agent configured (like OpenAI, Claude, or Gemini), Aight can use it directly.

#### Option B: Direct LLM Configuration
Configure a direct connection to your preferred LLM provider:

##### OpenAI
- **Models**: GPT-4, GPT-4-turbo, GPT-3.5-turbo
- **API Key**: Get from [OpenAI Platform](https://platform.openai.com/api-keys)

##### Anthropic Claude
- **Models**: Claude-3 Opus, Sonnet, Haiku
- **API Key**: Get from [Anthropic Console](https://console.anthropic.com/)

##### Google Gemini
- **Models**: Gemini Pro, Gemini Pro Vision
- **API Key**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)

##### Other Providers
- **Mistral**: Mistral Large, Medium, Small
- **Groq**: Llama3-70B, Mixtral-8x7B
- **Ollama**: Local models (no API key required)
- **OpenRouter**: Access to multiple models through one API

### Step 3: Advanced Settings

- **Auto-Label**: Set a label (default: "AIGHT") to automatically tag all created entities
- **Temperature**: Control AI creativity (0.0 = focused, 2.0 = creative)
- **Max Tokens**: Set response length limit

## 🎯 How to Use

### Chat Interface

1. **Open Aight**: Navigate to "AI Config" in your sidebar
2. **Start Chatting**: Just type what you want to create
3. **Use Slash Commands** (optional):
   - `/automation` - Create an automation
   - `/scene` - Create a scene
   - `/script` - Create a script
   - `/dashboard` - Create a dashboard
   - `/template` - Create a template sensor
   - `/helper` - Create an input helper
4. **Review Configuration**: The AI generates YAML with a preview
5. **Deploy or Export**:
   - Click "Deploy to Database" to add directly to Home Assistant
   - Click "Export to YAML" to download the configuration file

### Conversation Management

- **Conversation History**: Access your chat history in the right sidebar
- **Cross-Device Sync**: Your conversations sync across all devices
- **Resume Chats**: Click any conversation to continue where you left off
- **Delete Conversations**: Remove old chats with the trash icon

### Example Conversation

```
You: /automation when I arrive home, turn on the entrance lights

🤖 Assistant: I'll create an automation that turns on entrance lights when you arrive home:
[Shows YAML configuration with Deploy/Export buttons]

You: also unlock the front door

🤖 Assistant: I've updated the automation to also unlock the front door:
[Shows updated configuration]

You: but only after sunset

🤖 Assistant: Added a sunset condition to the automation:
[Shows final configuration]
```

### Entity Autocomplete

In the Validate and Preview tabs:
- Start typing an entity ID to get suggestions
- Uses Home Assistant's native autocomplete system
- Shows entity states and attributes

## Advanced Features

### Auto-Labeling
- Automatically applies labels to all created entities
- Default label: "AIGHT" with star icon
- Customize in integration options
- Makes it easy to find AI-generated configurations

### Human-Readable IDs
- Generates descriptive IDs like `evening_lights_automation`
- No more timestamp-based IDs like `automation_1234567890`
- Automatic collision detection ensures uniqueness

### Deployment Options
- **Database Deployment**: Adds configurations directly to Home Assistant
- **YAML Export**: Downloads configuration files for manual integration
- **Template Sensors**: Exports to `template_sensors.yaml` with instructions

### Conversation Features
- **50 Conversation Limit**: Stores up to 50 conversations per user
- **Auto-Save**: Conversations save automatically as you chat
- **Search**: Quickly find past conversations
- **Privacy**: Each user has their own private conversation history

## API Reference

### WebSocket API

The integration provides WebSocket endpoints for conversation management:

#### Load Conversations
```javascript
await hass.connection.sendMessagePromise({
  type: 'ai_config_assistant/load_conversations'
});
```

#### Save Conversation
```javascript
await hass.connection.sendMessagePromise({
  type: 'ai_config_assistant/save_conversation',
  conversation: {...}
});
```

#### Delete Conversation
```javascript
await hass.connection.sendMessagePromise({
  type: 'ai_config_assistant/delete_conversation',
  conversation_id: 'conv_123...'
});
```

### REST API

#### Generate Configuration
```
POST /api/ai_config_assistant/generate
{
  "prompt": "Turn on lights when motion detected",
  "type": "automation",
  "entities": ["light.living_room", "binary_sensor.motion"]
}
```

#### Validate Configuration
```
POST /api/ai_config_assistant/validate
{
  "config": "yaml configuration",
  "type": "automation"
}
```

#### Get Entity Suggestions
```
POST /api/ai_config_assistant/entity_suggestions
{
  "query": "light",
  "limit": 10,
  "domain_filter": ["light", "switch"]
}
```

### Service Calls

#### Generate Configuration Service
```yaml
service: ai_config_assistant.generate_config
data:
  prompt: "Turn on lights at sunset"
  type: automation
  entities:
    - light.living_room
    - light.kitchen
```

#### Deploy Configuration Service
```yaml
service: ai_config_assistant.deploy_config
data:
  config: |
    alias: "Evening Lights"
    trigger:
      - platform: sun
        event: sunset
  type: automation
```

## Troubleshooting

### Common Issues

**Integration not loading:**
- Check Home Assistant logs for errors
- Ensure all dependencies are installed
- Verify the integration files are in the correct location

**Conversations not syncing:**
- Check WebSocket connection in browser console
- Verify user is logged in (not using bypass login)
- Clear browser cache and reload

**API key errors:**
- Verify your API key is correct and active
- Check that your account has sufficient credits/quota
- Ensure the selected model is available

**Entities not found:**
- Refresh the page to reload entity cache
- Check that entity IDs are correct
- Ensure entities are not disabled

**Template sensors not appearing:**
- Add `!include template_sensors.yaml` to configuration.yaml
- Restart Home Assistant after adding template sensors
- Check logs for template errors

### Debug Logging

Enable debug logging by adding to your `configuration.yaml`:

```yaml
logger:
  default: warning
  logs:
    custom_components.ai_config_assistant: debug
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## 📝 Changelog

### v1.5.0 (Latest) - Cross-Device Sync & Enhanced UI
- ☁️ **Cross-Device Conversation Sync**: Chat history syncs across all your devices
- 🏷️ **Auto-Labeling**: Automatically labels created entities with customizable tags
- ⚡ **Slash Commands**: Quick configuration access with `/automation`, `/scene`, etc.
- 📥 **Export to YAML**: Choose between database deployment or file export
- 🎯 **Human-Readable IDs**: Descriptive IDs instead of timestamps
- 🎨 **UI Overhaul**: Tabs moved to header, entity autocomplete everywhere
- 💾 **Server Storage**: Conversations stored in Home Assistant, not browser
- 🔄 **Auto-Migration**: Existing conversations automatically migrate to server
- 🔐 **User Privacy**: Each user has their own private conversation history

### v1.4.0 - Enhanced Error Handling
- ✅ User-friendly error messages for common issues
- 💳 OpenAI quota errors show billing links
- 🔑 Clear API key configuration instructions
- 🌐 Better network error handling

### Previous Versions
See [GitHub Releases](https://github.com/toml0006/aight/releases) for full changelog.

## Support

- **📖 Documentation**: Visit [toml0006.github.io/aight](https://toml0006.github.io/aight/) for full documentation
- **🐛 Issues**: Report bugs on [GitHub Issues](https://github.com/toml0006/aight/issues)
- **💬 Discussions**: Join [GitHub Discussions](https://github.com/toml0006/aight/discussions)
- **🏡 Community**: Visit the [Home Assistant Community Forum](https://community.home-assistant.io/)

## Disclaimer

This integration uses third-party AI services. Please review the privacy policies and terms of service of your chosen LLM provider. Generated configurations should always be reviewed before deployment in production environments.