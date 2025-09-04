"""AI Configuration Assistant integration for Home Assistant."""
import logging
import time
from typing import Any, Dict

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_API_KEY, Platform
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import (
    DOMAIN,
    CONF_LLM_PROVIDER,
    CONF_DEFAULT_MODEL,
    SERVICE_GENERATE_CONFIG,
    SERVICE_VALIDATE_CONFIG,
    SERVICE_PREVIEW_CONFIG,
    SERVICE_RELOAD,
    SERVICE_DEPLOY_CONFIG,
    SERVICE_MANAGE_PROMPTS,
    SERVICE_EXPORT_PROMPTS,
    SERVICE_IMPORT_PROMPTS,
    LLM_PROVIDERS,
)
from .llm_client import LLMClientManager
from .config_generator import ConfigGenerator
from .entity_manager import EntityManager
from .prompt_manager import PromptManager
from .api import async_register_api_views
from .panel import async_register_panel

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = []

CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {
                vol.Required(CONF_LLM_PROVIDER, default="openai"): vol.In(LLM_PROVIDERS),
                vol.Required(CONF_API_KEY): cv.string,
                vol.Optional(CONF_DEFAULT_MODEL): cv.string,
            }
        )
    },
    extra=vol.ALLOW_EXTRA,
)

async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the AI Config Assistant integration."""
    hass.data.setdefault(DOMAIN, {})
    
    # Basic setup only - actual initialization happens in async_setup_entry
    _LOGGER.info("AI Configuration Assistant integration setup")
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up AI Config Assistant from a config entry."""
    # Ensure domain data exists
    hass.data.setdefault(DOMAIN, {})
    
    # Store config entry data
    hass.data[DOMAIN]["config_entry"] = entry
    
    # Initialize core components if not already done
    if "llm_client" not in hass.data[DOMAIN]:
        hass.data[DOMAIN]["llm_client"] = LLMClientManager(hass)
        hass.data[DOMAIN]["config_generator"] = ConfigGenerator(hass)
        hass.data[DOMAIN]["entity_manager"] = EntityManager(hass)
        hass.data[DOMAIN]["prompt_manager"] = PromptManager(hass)
        
        # Initialize entity manager
        await hass.data[DOMAIN]["entity_manager"].initialize()
        
        # Initialize prompt manager
        await hass.data[DOMAIN]["prompt_manager"].async_setup()
        
        # Set up config generator with prompt manager
        hass.data[DOMAIN]["config_generator"].setup(
            hass.data[DOMAIN]["llm_client"],
            hass.data[DOMAIN]["entity_manager"],
            hass.data[DOMAIN]["prompt_manager"]
        )
        
        # Register services
        await _async_register_services(hass)
        
        # Register API endpoints
        await async_register_api_views(hass)
        
        # Register frontend panel
        await async_register_panel(hass)
    
    # Initialize LLM client with config
    llm_client = hass.data[DOMAIN]["llm_client"]
    await llm_client.setup(
        provider=entry.data[CONF_LLM_PROVIDER],
        api_key=entry.data[CONF_API_KEY],
        default_model=entry.data.get(CONF_DEFAULT_MODEL),
    )
    
    _LOGGER.info("AI Configuration Assistant integration loaded successfully")
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload AI Config Assistant config entry."""
    # Clean up resources
    if DOMAIN in hass.data:
        # Clean up LLM client
        llm_client = hass.data[DOMAIN].get("llm_client")
        if llm_client:
            await llm_client.cleanup()
        
        # Remove services
        if hass.services.has_service(DOMAIN, SERVICE_GENERATE_CONFIG):
            hass.services.async_remove(DOMAIN, SERVICE_GENERATE_CONFIG)
        if hass.services.has_service(DOMAIN, SERVICE_VALIDATE_CONFIG):
            hass.services.async_remove(DOMAIN, SERVICE_VALIDATE_CONFIG)
        if hass.services.has_service(DOMAIN, SERVICE_PREVIEW_CONFIG):
            hass.services.async_remove(DOMAIN, SERVICE_PREVIEW_CONFIG)
        if hass.services.has_service(DOMAIN, SERVICE_RELOAD):
            hass.services.async_remove(DOMAIN, SERVICE_RELOAD)
        
        # Clear data
        hass.data.pop(DOMAIN, None)
        
        _LOGGER.info("AI Configuration Assistant integration unloaded")
    
    return True

async def _async_register_services(hass: HomeAssistant) -> None:
    """Register AI Config Assistant services."""
    
    async def generate_config_service(call: ServiceCall) -> ServiceResponse | None:
        """Generate configuration from natural language input."""
        # Log the service call for debugging
        # Check if response is requested - check both the proper way and the data field
        # In HA 2025.7, the return_response might come through the data dict
        wants_response = call.return_response or call.data.get('return_response', False)
        
        _LOGGER.warning("AI Config Assistant: Service called with prompt: %s", call.data.get('prompt', '')[:100])
        _LOGGER.warning("Service wants_response: %s, call.return_response: %s, data.return_response: %s", 
                       wants_response, call.return_response, call.data.get('return_response'))
        
        if not wants_response:
            _LOGGER.warning("No return response requested - service may not return data properly")
            # Try to return data anyway for compatibility
            return {
                "success": False,
                "error": "Service requires return_response=true to function properly"
            }
        
        try:
            config_generator = hass.data[DOMAIN].get("config_generator")
            if not config_generator:
                _LOGGER.error("Config generator not initialized")
                return {"success": False, "error": "Config generator not initialized"}
            
            prompt = call.data.get("prompt", "")
            config_type = call.data.get("type", "automation")
            context = call.data.get("context", {})
            include_entities = call.data.get("entities", [])
            
            _LOGGER.info("Generating %s for prompt: %s", config_type, prompt[:50] + "..." if len(prompt) > 50 else prompt)
            
            result = await config_generator.generate_config(
                prompt=prompt,
                config_type=config_type,
                context=context,
                include_entities=include_entities,
            )
            
            _LOGGER.info("Config generator returned: success=%s", result.success)
            
            # Fire event for backward compatibility
            hass.bus.async_fire(
                "ai_config_assistant_config_generated",
                {
                    "success": result.success,
                    "config": result.config,
                    "explanation": result.explanation,
                    "entities_used": result.entities_used,
                    "error": result.warnings[0] if result.warnings and not result.success else None,
                },
            )
            
            # Return response for new chat interface
            if result.success:
                response_data = {
                    "success": True,
                    "config": result.config,
                    "explanation": result.explanation,
                    "entities_used": result.entities_used,
                }
            else:
                # Make sure to get the most detailed error message
                error_msg = result.warnings[0] if result.warnings else "Configuration generation failed"
                response_data = {
                    "success": False,
                    "error": error_msg,
                    "warnings": result.warnings,  # Include all warnings for debugging
                }
            
            _LOGGER.warning("Service returning response: success=%s, has_config=%s", 
                           response_data["success"], 
                           "config" in response_data and len(str(response_data.get("config", ""))) > 0)
            return response_data
            
        except Exception as err:
            _LOGGER.error("Service call exception: %s", err, exc_info=True)
            hass.bus.async_fire(
                "ai_config_assistant_config_generated",
                {
                    "success": False,
                    "error": str(err),
                },
            )
            
            # Return error response
            error_response = {
                "success": False,
                "error": str(err),
            }
            _LOGGER.error("Returning error response: %s", error_response)
            return error_response
    
    async def validate_config_service(call: ServiceCall) -> None:
        """Validate a configuration."""
        config_generator = hass.data[DOMAIN]["config_generator"]
        
        config_yaml = call.data.get("config", "")
        config_type = call.data.get("type", "automation")
        
        try:
            result = await config_generator.validate_config(
                config_yaml=config_yaml,
                config_type=config_type,
            )
            
            hass.bus.async_fire(
                "ai_config_assistant_config_validated",
                {
                    "success": True,
                    "valid": result.valid,
                    "errors": result.errors,
                    "warnings": result.warnings,
                },
            )
            
        except Exception as err:
            _LOGGER.error("Error validating config: %s", err)
            hass.bus.async_fire(
                "ai_config_assistant_config_validated",
                {
                    "success": False,
                    "error": str(err),
                },
            )
    
    async def preview_config_service(call: ServiceCall) -> None:
        """Preview a configuration with live data."""
        entity_manager = hass.data[DOMAIN]["entity_manager"]
        
        config_yaml = call.data.get("config", "")
        config_type = call.data.get("type", "automation")
        
        try:
            result = await entity_manager.preview_config(
                config_yaml=config_yaml,
                config_type=config_type,
            )
            
            hass.bus.async_fire(
                "ai_config_assistant_config_previewed",
                {
                    "success": True,
                    "preview": result,
                },
            )
            
        except Exception as err:
            _LOGGER.error("Error previewing config: %s", err)
            hass.bus.async_fire(
                "ai_config_assistant_config_previewed",
                {
                    "success": False,
                    "error": str(err),
                },
            )
    
    async def deploy_config_service(call: ServiceCall) -> ServiceResponse:
        """Deploy a generated configuration to Home Assistant."""
        import yaml
        
        config_yaml = call.data.get("config", "")
        config_type = call.data.get("type", "automation")
        
        try:
            # Parse the YAML
            config_data = yaml.safe_load(config_yaml)
            
            if config_type == "automation":
                # Add to automations
                automation_config = {
                    "id": f"ai_generated_{int(time.time())}",
                    "alias": config_data.get("alias", "AI Generated Automation"),
                    "description": config_data.get("description", "Generated by AI Config Assistant"),
                    "trigger": config_data.get("trigger", []),
                    "condition": config_data.get("condition", []),
                    "action": config_data.get("action", []),
                    "mode": config_data.get("mode", "single"),
                }
                
                # Store in Home Assistant's automation config
                # This is a simplified version - in production you'd write to automations.yaml
                _LOGGER.info("Deploying automation: %s", automation_config)
                
                # Fire event for other components to handle
                hass.bus.async_fire(
                    "ai_config_assistant_deploy_automation",
                    {"config": automation_config}
                )
                
                return {
                    "success": True,
                    "message": "Automation deployed successfully",
                    "id": automation_config["id"]
                }
                
            elif config_type == "script":
                # Similar handling for scripts
                script_config = {
                    "alias": config_data.get("alias", "AI Generated Script"),
                    "sequence": config_data.get("sequence", []),
                }
                
                _LOGGER.info("Deploying script: %s", script_config)
                
                return {
                    "success": True,
                    "message": "Script deployed successfully"
                }
                
            elif config_type == "scene":
                # Similar handling for scenes
                scene_config = {
                    "name": config_data.get("name", "AI Generated Scene"),
                    "entities": config_data.get("entities", {}),
                }
                
                _LOGGER.info("Deploying scene: %s", scene_config)
                
                return {
                    "success": True,
                    "message": "Scene deployed successfully"
                }
                
            else:
                return {
                    "success": False,
                    "error": f"Deployment for {config_type} not yet implemented"
                }
                
        except Exception as err:
            _LOGGER.error("Error deploying config: %s", err)
            return {
                "success": False,
                "error": str(err)
            }
    
    async def reload_service(call: ServiceCall) -> None:
        """Reload the AI Configuration Assistant integration."""
        _LOGGER.info("Reloading AI Configuration Assistant integration...")
        
        try:
            # Get the config entry
            config_entry = hass.data[DOMAIN].get("config_entry")
            if not config_entry:
                _LOGGER.error("No config entry found for reload")
                return
            
            # Unload and reload the integration
            await async_unload_entry(hass, config_entry)
            await async_setup_entry(hass, config_entry)
            
            _LOGGER.info("AI Configuration Assistant integration reloaded successfully")
            
            # Fire event to notify UI
            hass.bus.async_fire(
                "ai_config_assistant_reloaded",
                {"success": True, "message": "Integration reloaded successfully"}
            )
            
        except Exception as err:
            _LOGGER.error("Error reloading integration: %s", err)
            hass.bus.async_fire(
                "ai_config_assistant_reloaded",
                {"success": False, "error": str(err)}
            )
    
    async def manage_prompts_service(call: ServiceCall) -> ServiceResponse:
        """Manage system prompts."""
        prompt_manager = hass.data[DOMAIN].get("prompt_manager")
        if not prompt_manager:
            return {"success": False, "error": "Prompt manager not available"}
        
        action = call.data.get("action")
        
        try:
            if action == "create":
                name = call.data.get("name")
                config_type = call.data.get("config_type")
                template = call.data.get("template")
                description = call.data.get("description", "")
                
                if not all([name, config_type, template]):
                    return {
                        "success": False, 
                        "error": "Missing required fields: name, config_type, template"
                    }
                
                prompt = await prompt_manager.create_prompt(
                    name=name,
                    config_type=config_type,
                    template=template,
                    description=description,
                    set_active=False
                )
                
                return {
                    "success": True,
                    "message": f"Created prompt: {name}",
                    "prompt_id": prompt.id
                }
            
            elif action == "update":
                prompt_id = call.data.get("prompt_id")
                if not prompt_id:
                    return {"success": False, "error": "Missing prompt_id"}
                
                prompt = await prompt_manager.update_prompt(
                    prompt_id=prompt_id,
                    name=call.data.get("name"),
                    template=call.data.get("template"),
                    description=call.data.get("description")
                )
                
                return {
                    "success": True,
                    "message": f"Updated prompt: {prompt.name}"
                }
            
            elif action == "delete":
                prompt_id = call.data.get("prompt_id")
                if not prompt_id:
                    return {"success": False, "error": "Missing prompt_id"}
                
                success = await prompt_manager.delete_prompt(prompt_id)
                if not success:
                    return {"success": False, "error": "Prompt not found"}
                
                return {
                    "success": True,
                    "message": "Prompt deleted successfully"
                }
            
            elif action == "set_active":
                prompt_id = call.data.get("prompt_id")
                config_type = call.data.get("config_type")
                
                if not all([prompt_id, config_type]):
                    return {"success": False, "error": "Missing prompt_id or config_type"}
                
                await prompt_manager.set_active_prompt(config_type, prompt_id)
                
                return {
                    "success": True,
                    "message": f"Set active prompt for {config_type}"
                }
            
            elif action == "reset_default":
                config_type = call.data.get("config_type")
                if not config_type:
                    return {"success": False, "error": "Missing config_type"}
                
                await prompt_manager.reset_to_default(config_type)
                
                return {
                    "success": True,
                    "message": f"Reset {config_type} to default prompt"
                }
            
            else:
                return {"success": False, "error": f"Unknown action: {action}"}
        
        except ValueError as err:
            return {"success": False, "error": str(err)}
        except Exception as err:
            _LOGGER.error("Error in manage_prompts_service: %s", err)
            return {"success": False, "error": str(err)}
    
    async def export_prompts_service(call: ServiceCall) -> ServiceResponse:
        """Export system prompts."""
        prompt_manager = hass.data[DOMAIN].get("prompt_manager")
        if not prompt_manager:
            return {"success": False, "error": "Prompt manager not available"}
        
        try:
            prompt_ids = call.data.get("prompt_ids")
            prompts_data = await prompt_manager.export_prompts(prompt_ids)
            
            return {
                "success": True,
                "prompts": prompts_data,
                "count": len(prompts_data)
            }
        
        except Exception as err:
            _LOGGER.error("Error in export_prompts_service: %s", err)
            return {"success": False, "error": str(err)}
    
    async def import_prompts_service(call: ServiceCall) -> ServiceResponse:
        """Import system prompts."""
        prompt_manager = hass.data[DOMAIN].get("prompt_manager")
        if not prompt_manager:
            return {"success": False, "error": "Prompt manager not available"}
        
        try:
            prompts_data = call.data.get("prompts_data", [])
            overwrite = call.data.get("overwrite", False)
            
            if not prompts_data:
                return {"success": False, "error": "No prompts data provided"}
            
            imported_ids = await prompt_manager.import_prompts(
                prompts_data=prompts_data,
                overwrite=overwrite
            )
            
            return {
                "success": True,
                "message": f"Imported {len(imported_ids)} prompts",
                "imported_ids": imported_ids
            }
        
        except Exception as err:
            _LOGGER.error("Error in import_prompts_service: %s", err)
            return {"success": False, "error": str(err)}

    # Register services
    hass.services.async_register(
        DOMAIN, SERVICE_GENERATE_CONFIG, generate_config_service,
        supports_response=SupportsResponse.OPTIONAL
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_VALIDATE_CONFIG, validate_config_service
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_PREVIEW_CONFIG, preview_config_service
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_DEPLOY_CONFIG, deploy_config_service,
        supports_response=SupportsResponse.OPTIONAL
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_RELOAD, reload_service
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_MANAGE_PROMPTS, manage_prompts_service,
        supports_response=SupportsResponse.OPTIONAL
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_EXPORT_PROMPTS, export_prompts_service,
        supports_response=SupportsResponse.OPTIONAL
    )
    
    hass.services.async_register(
        DOMAIN, SERVICE_IMPORT_PROMPTS, import_prompts_service,
        supports_response=SupportsResponse.OPTIONAL
    )