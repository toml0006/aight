"""Config flow for AI Configuration Assistant."""
import logging
from typing import Any, Dict, Optional

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_API_KEY
from homeassistant.core import HomeAssistant, callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    DOMAIN,
    CONF_LLM_PROVIDER,
    CONF_DEFAULT_MODEL,
    CONF_TEMPERATURE,
    CONF_MAX_TOKENS,
    CONF_AUTO_LABEL,
    LLM_PROVIDERS,
    DEFAULT_MODELS,
    DEFAULT_TEMPERATURE,
    DEFAULT_MAX_TOKENS,
)
from .conversation_agent import ConversationAgentManager

CONF_USE_CONVERSATION_AGENT = "use_conversation_agent"
CONF_CONVERSATION_AGENT_ID = "conversation_agent_id"

_LOGGER = logging.getLogger(__name__)

class AIConfigAssistantConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for AI Configuration Assistant."""

    VERSION = 1

    def __init__(self) -> None:
        """Initialize the config flow."""
        self.data: Dict[str, Any] = {}

    async def async_step_user(
        self, user_input: Optional[Dict[str, Any]] = None
    ) -> FlowResult:
        """Handle the initial step - choose between conversation agent or direct LLM."""
        if user_input is not None:
            if user_input.get(CONF_USE_CONVERSATION_AGENT):
                # User wants to use existing conversation agent
                return await self.async_step_select_agent()
            else:
                # User wants to configure direct LLM
                return await self.async_step_llm_provider()
        
        # Check if there are any conversation agents available
        agent_manager = ConversationAgentManager(self.hass)
        available_agents = await agent_manager.get_available_agents()
        
        if available_agents:
            # Show option to use conversation agent or direct LLM
            return self.async_show_form(
                step_id="user",
                data_schema=vol.Schema({
                    vol.Required(CONF_USE_CONVERSATION_AGENT, default=False): bool,
                }),
                description_placeholders={
                    "agents_found": f"Found {len(available_agents)} conversation agent(s)"
                },
            )
        else:
            # No conversation agents found, go directly to LLM provider setup
            return await self.async_step_llm_provider()
    
    async def async_step_select_agent(
        self, user_input: Optional[Dict[str, Any]] = None
    ) -> FlowResult:
        """Handle conversation agent selection."""
        errors = {}
        
        if user_input is not None:
            # Store the selected agent
            self.data = {
                CONF_USE_CONVERSATION_AGENT: True,
                CONF_CONVERSATION_AGENT_ID: user_input[CONF_CONVERSATION_AGENT_ID],
            }
            return await self.async_step_advanced()
        
        # Get available conversation agents
        agent_manager = ConversationAgentManager(self.hass)
        available_agents = await agent_manager.get_available_agents()
        
        if not available_agents:
            # No agents found, fall back to direct LLM
            return await self.async_step_llm_provider()
        
        return self.async_show_form(
            step_id="select_agent",
            data_schema=vol.Schema({
                vol.Required(CONF_CONVERSATION_AGENT_ID): vol.In(available_agents),
            }),
            errors=errors,
        )
    
    async def async_step_llm_provider(
        self, user_input: Optional[Dict[str, Any]] = None
    ) -> FlowResult:
        """Handle LLM provider configuration."""
        errors = {}

        if user_input is not None:
            # Validate the provider selection
            provider = user_input[CONF_LLM_PROVIDER]
            api_key = user_input[CONF_API_KEY]

            if not api_key.strip():
                errors[CONF_API_KEY] = "api_key_required"
            else:
                # Test the API key
                try:
                    is_valid = await self._test_api_key(provider, api_key)
                    if not is_valid:
                        errors[CONF_API_KEY] = "invalid_api_key"
                    else:
                        # Store the basic config
                        self.data = user_input.copy()
                        self.data[CONF_USE_CONVERSATION_AGENT] = False
                        return await self.async_step_advanced()
                except Exception as err:
                    _LOGGER.error("Error testing API key: %s", err)
                    errors["base"] = "connection_error"

        return self.async_show_form(
            step_id="llm_provider",
            data_schema=vol.Schema({
                vol.Required(CONF_LLM_PROVIDER, default="openai"): vol.In(LLM_PROVIDERS),
                vol.Required(CONF_API_KEY): str,
            }),
            errors=errors,
        )

    async def async_step_advanced(
        self, user_input: Optional[Dict[str, Any]] = None
    ) -> FlowResult:
        """Handle advanced configuration options."""
        if user_input is not None:
            # Merge advanced settings with basic config
            self.data.update(user_input)
            
            # Set default model if not provided and we're using direct LLM
            if not self.data.get(CONF_USE_CONVERSATION_AGENT, False):
                if CONF_DEFAULT_MODEL not in self.data:
                    provider = self.data.get(CONF_LLM_PROVIDER)
                    if provider:
                        self.data[CONF_DEFAULT_MODEL] = DEFAULT_MODELS.get(provider)

            # Create appropriate title based on configuration type
            if self.data.get(CONF_USE_CONVERSATION_AGENT, False):
                title = "AI Config Assistant (Conversation Agent)"
            else:
                provider = self.data.get(CONF_LLM_PROVIDER, "Unknown")
                title = f"AI Config Assistant ({provider})"

            return self.async_create_entry(
                title=title,
                data=self.data,
            )

        # Check if we're using conversation agent or direct LLM
        if self.data.get(CONF_USE_CONVERSATION_AGENT, False):
            # For conversation agents, we don't need advanced settings
            # Just create the entry directly
            return self.async_create_entry(
                title="AI Config Assistant (Conversation Agent)",
                data=self.data,
            )
        else:
            # For direct LLM, show advanced settings
            provider = self.data.get(CONF_LLM_PROVIDER, "openai")
            default_model = DEFAULT_MODELS.get(provider, "")

            return self.async_show_form(
                step_id="advanced",
                data_schema=vol.Schema({
                    vol.Optional(CONF_DEFAULT_MODEL, default=default_model): str,
                    vol.Optional(CONF_TEMPERATURE, default=DEFAULT_TEMPERATURE): vol.All(
                        vol.Coerce(float), vol.Range(min=0.0, max=2.0)
                    ),
                    vol.Optional(CONF_MAX_TOKENS, default=DEFAULT_MAX_TOKENS): vol.All(
                        vol.Coerce(int), vol.Range(min=100, max=4000)
                    ),
                    vol.Optional(CONF_AUTO_LABEL, default="AIGHT"): str,
                }),
                description_placeholders={
                    "label_hint": "This label will be created with the AIGHT icon and assigned to all automations, scripts, and scenes created by this integration"
                }
            )

    async def _test_api_key(self, provider: str, api_key: str) -> bool:
        """Test the API key for the specified provider."""
        # For now, we'll just do basic validation and skip API testing
        # to avoid issues with rate limits, network issues, etc.
        # The actual API key will be validated when the user tries to use the service
        
        _LOGGER.info("Validating API key format for provider %s", provider)
        
        # Basic validation - just check if the key looks reasonable
        if not api_key or len(api_key.strip()) < 10:
            _LOGGER.warning("API key appears too short for provider %s", provider)
            return False
            
        # Provider-specific format validation
        if provider == "openai":
            # OpenAI keys typically start with "sk-"
            if not api_key.startswith("sk-"):
                _LOGGER.warning("OpenAI API key should start with 'sk-'")
                # Still allow it as OpenAI may change formats
        elif provider == "anthropic":
            # Anthropic keys typically start with "sk-ant-"
            if not api_key.startswith("sk-"):
                _LOGGER.warning("Anthropic API key should start with 'sk-'")
                # Still allow it
                
        _LOGGER.info("API key format accepted for provider %s", provider)
        return True

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Create the options flow."""
        return AIConfigAssistantOptionsFlowHandler(config_entry)


class AIConfigAssistantOptionsFlowHandler(config_entries.OptionsFlow):
    """Handle options flow for AI Configuration Assistant."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(
        self, user_input: Optional[Dict[str, Any]] = None
    ) -> FlowResult:
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        current_temperature = self.config_entry.options.get(
            CONF_TEMPERATURE, 
            self.config_entry.data.get(CONF_TEMPERATURE, DEFAULT_TEMPERATURE)
        )
        current_max_tokens = self.config_entry.options.get(
            CONF_MAX_TOKENS,
            self.config_entry.data.get(CONF_MAX_TOKENS, DEFAULT_MAX_TOKENS)
        )
        current_auto_label = self.config_entry.options.get(
            CONF_AUTO_LABEL,
            self.config_entry.data.get(CONF_AUTO_LABEL, "")
        )

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema({
                vol.Optional(CONF_TEMPERATURE, default=current_temperature): vol.All(
                    vol.Coerce(float), vol.Range(min=0.0, max=2.0)
                ),
                vol.Optional(CONF_MAX_TOKENS, default=current_max_tokens): vol.All(
                    vol.Coerce(int), vol.Range(min=100, max=4000)
                ),
                vol.Optional(CONF_AUTO_LABEL, default=current_auto_label): str,
            }),
            description_placeholders={
                "label_hint": "This label will be created with the AIGHT icon and assigned to all automations, scripts, and scenes created by this integration"
            }
        )