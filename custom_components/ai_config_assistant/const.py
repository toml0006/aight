"""Constants for AI Configuration Assistant."""

DOMAIN = "ai_config_assistant"

# Configuration keys
CONF_LLM_PROVIDER = "llm_provider"
CONF_DEFAULT_MODEL = "default_model"
CONF_MAX_TOKENS = "max_tokens"
CONF_TEMPERATURE = "temperature"

# LLM Providers
LLM_PROVIDERS = [
    "openai",
    "anthropic", 
    "google",
    "mistral",
    "groq",
    "ollama",
    "openrouter",
]

# Default models for each provider
DEFAULT_MODELS = {
    "openai": "gpt-3.5-turbo",
    "anthropic": "claude-3-sonnet-20240229",
    "google": "gemini-pro",
    "mistral": "mistral-large-latest",
    "groq": "llama3-70b-8192",
    "ollama": "llama2",
    "openrouter": "openai/gpt-3.5-turbo",
}

# Services
SERVICE_GENERATE_CONFIG = "generate_config"
SERVICE_VALIDATE_CONFIG = "validate_config"
SERVICE_PREVIEW_CONFIG = "preview_config"
SERVICE_GET_ENTITIES = "get_entities"
SERVICE_GET_SUGGESTIONS = "get_suggestions"
SERVICE_RELOAD = "reload"
SERVICE_DEPLOY_CONFIG = "deploy_config"
SERVICE_MANAGE_PROMPTS = "manage_prompts"
SERVICE_EXPORT_PROMPTS = "export_prompts"
SERVICE_IMPORT_PROMPTS = "import_prompts"

# Configuration types
CONFIG_TYPES = [
    "automation",
    "script",
    "scene",
    "dashboard",
    "card",
    "sensor",
    "binary_sensor",
    "template",
]

# Events
EVENT_CONFIG_GENERATED = f"{DOMAIN}_config_generated"
EVENT_CONFIG_VALIDATED = f"{DOMAIN}_config_validated"
EVENT_CONFIG_PREVIEWED = f"{DOMAIN}_config_previewed"

# Panel configuration
PANEL_NAME = "aight"
PANEL_TITLE = "Aight"
PANEL_ICON = "mdi:star-shooting-outline"
PANEL_URL = "/ai-config-assistant-frontend/panel.js"

# Default generation parameters
DEFAULT_MAX_TOKENS = 2000
DEFAULT_TEMPERATURE = 0.1
DEFAULT_TOP_P = 0.9

# Entity filtering
EXCLUDED_DOMAINS = [
    "zone",
    "device_tracker", 
    "persistent_notification",
    "updater",
]

PREFERRED_DOMAINS = [
    "light",
    "switch", 
    "sensor",
    "binary_sensor",
    "climate",
    "cover",
    "fan",
    "lock",
    "media_player",
    "camera",
    "vacuum",
    "alarm_control_panel",
]

# Prompt templates
AUTOMATION_PROMPT = """
Create a Home Assistant automation based on this request: {prompt}

Available entities:
{entities}

Current time: {current_time}
Current states: {current_states}

Generate a complete YAML automation configuration. Include:
1. A descriptive alias
2. Appropriate trigger(s)
3. Relevant condition(s) if needed
4. Clear action(s)

Respond with valid YAML only.
"""

DASHBOARD_PROMPT = """
Create a Home Assistant dashboard configuration based on this request: {prompt}

Available entities:
{entities}

Current states: {current_states}

Generate a complete dashboard YAML configuration following Lovelace format. Include:
1. Appropriate views and sections
2. Relevant cards for the entities
3. Proper layout and organization

Respond with valid YAML only.
"""

SCRIPT_PROMPT = """
Create a Home Assistant script based on this request: {prompt}

Available entities:
{entities}

Available services: {services}

Generate a complete script YAML configuration. Include:
1. A descriptive alias
2. Clear sequence of actions
3. Proper service calls with data

Respond with valid YAML only.
"""