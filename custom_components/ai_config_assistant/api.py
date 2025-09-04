"""API endpoints for AI Configuration Assistant."""
import logging
from typing import Any, Dict
import json

from aiohttp import web
from aiohttp.web import Request, Response
import voluptuous as vol

from homeassistant.core import HomeAssistant
from homeassistant.components.http import HomeAssistantView
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

class EntitySuggestionsView(HomeAssistantView):
    """View for entity suggestions API."""
    
    url = "/api/ai_config_assistant/entity_suggestions"
    name = "api:ai_config_assistant:entity_suggestions"
    requires_auth = True

    async def post(self, request: Request) -> Response:
        """Handle entity suggestions request."""
        hass: HomeAssistant = request.app["hass"]
        
        try:
            data = await request.json()
            query = data.get("query", "")
            limit = data.get("limit", 10)
            domain_filter = data.get("domain_filter")

            entity_manager = hass.data[DOMAIN].get("entity_manager")
            if not entity_manager:
                return web.json_response(
                    {"error": "Entity manager not available"}, status=500
                )

            suggestions = await entity_manager.get_entity_suggestions(
                query=query,
                domain_filter=domain_filter,
                limit=limit
            )

            # Convert suggestions to JSON-serializable format
            result = []
            for suggestion in suggestions:
                result.append({
                    "entity_id": suggestion.entity_id,
                    "name": suggestion.name,
                    "domain": suggestion.domain,
                    "score": suggestion.score,
                    "context": suggestion.context,
                })

            return web.json_response(result)

        except Exception as err:
            _LOGGER.error("Error in entity suggestions: %s", err)
            return web.json_response(
                {"error": str(err)}, status=500
            )


class ConfigGenerationView(HomeAssistantView):
    """View for config generation API."""
    
    url = "/api/ai_config_assistant/generate"
    name = "api:ai_config_assistant:generate" 
    requires_auth = True

    async def post(self, request: Request) -> Response:
        """Handle configuration generation request."""
        hass: HomeAssistant = request.app["hass"]
        
        try:
            data = await request.json()
            prompt = data.get("prompt", "")
            config_type = data.get("type", "automation")
            context = data.get("context", {})
            
            if not prompt.strip():
                return web.json_response(
                    {"error": "Prompt is required"}, status=400
                )

            config_generator = hass.data[DOMAIN].get("config_generator")
            if not config_generator:
                return web.json_response(
                    {"error": "Config generator not available"}, status=500
                )

            result = await config_generator.generate_config(
                prompt=prompt,
                config_type=config_type,
                context=context
            )

            return web.json_response({
                "success": result.success,
                "config": result.config,
                "explanation": result.explanation,
                "entities_used": result.entities_used,
                "warnings": result.warnings,
            })

        except Exception as err:
            _LOGGER.error("Error in config generation: %s", err)
            return web.json_response(
                {"error": str(err)}, status=500
            )


class ConfigValidationView(HomeAssistantView):
    """View for config validation API."""
    
    url = "/api/ai_config_assistant/validate"
    name = "api:ai_config_assistant:validate"
    requires_auth = True

    async def post(self, request: Request) -> Response:
        """Handle configuration validation request."""
        hass: HomeAssistant = request.app["hass"]
        
        try:
            data = await request.json()
            config_yaml = data.get("config", "")
            config_type = data.get("type", "automation")
            
            if not config_yaml.strip():
                return web.json_response(
                    {"error": "Configuration is required"}, status=400
                )

            config_generator = hass.data[DOMAIN].get("config_generator")
            if not config_generator:
                return web.json_response(
                    {"error": "Config generator not available"}, status=500
                )

            result = await config_generator.validate_config(
                config_yaml=config_yaml,
                config_type=config_type
            )

            return web.json_response({
                "valid": result.valid,
                "errors": result.errors,
                "warnings": result.warnings,
                "suggestions": result.suggestions,
            })

        except Exception as err:
            _LOGGER.error("Error in config validation: %s", err)
            return web.json_response(
                {"error": str(err)}, status=500
            )


class ConfigPreviewView(HomeAssistantView):
    """View for config preview API."""
    
    url = "/api/ai_config_assistant/preview"
    name = "api:ai_config_assistant:preview"
    requires_auth = True

    async def post(self, request: Request) -> Response:
        """Handle configuration preview request."""
        hass: HomeAssistant = request.app["hass"]
        
        try:
            data = await request.json()
            config_yaml = data.get("config", "")
            config_type = data.get("type", "automation")
            
            if not config_yaml.strip():
                return web.json_response(
                    {"error": "Configuration is required"}, status=400
                )

            entity_manager = hass.data[DOMAIN].get("entity_manager")
            if not entity_manager:
                return web.json_response(
                    {"error": "Entity manager not available"}, status=500
                )

            result = await entity_manager.preview_config(
                config_yaml=config_yaml,
                config_type=config_type
            )

            return web.json_response({
                "preview_html": result.preview_html,
                "entities_referenced": result.entities_referenced,
                "warnings": result.warnings,
                "errors": result.errors,
            })

        except Exception as err:
            _LOGGER.error("Error in config preview: %s", err)
            return web.json_response(
                {"error": str(err)}, status=500
            )


class EntitiesView(HomeAssistantView):
    """View for entities API."""
    
    url = "/api/ai_config_assistant/entities"
    name = "api:ai_config_assistant:entities"
    requires_auth = True

    async def get(self, request: Request) -> Response:
        """Get entities information."""
        hass: HomeAssistant = request.app["hass"]
        
        try:
            domain = request.query.get("domain")
            area = request.query.get("area")
            
            entity_manager = hass.data[DOMAIN].get("entity_manager")
            if not entity_manager:
                return web.json_response(
                    {"error": "Entity manager not available"}, status=500
                )

            if domain:
                entities = await entity_manager.get_entities_by_domain(domain)
            elif area:
                entities = await entity_manager.get_entities_by_area(area)
            else:
                # Return summary information
                return web.json_response({
                    "entity_count": entity_manager.entity_count,
                    "last_update": entity_manager.last_update.isoformat() if entity_manager.last_update else None,
                    "domains": list(entity_manager._entities_by_domain.keys()),
                    "areas": list(entity_manager._entities_by_area.keys()),
                })

            # Convert entities to JSON-serializable format
            result = []
            for entity in entities:
                result.append({
                    "entity_id": entity.entity_id,
                    "name": entity.name,
                    "domain": entity.domain,
                    "state": entity.state,
                    "area_name": entity.area_name,
                    "device_name": entity.device_name,
                    "attributes": entity.attributes,
                })

            return web.json_response(result)

        except Exception as err:
            _LOGGER.error("Error in entities endpoint: %s", err)
            return web.json_response(
                {"error": str(err)}, status=500
            )


class SystemPromptsView(HomeAssistantView):
    """View for system prompts management API."""
    
    url = "/api/ai_config_assistant/prompts"
    name = "api:ai_config_assistant:prompts"
    requires_auth = True

    async def get(self, request: Request) -> Response:
        """Get all system prompts."""
        hass: HomeAssistant = request.app["hass"]
        
        try:
            config_type = request.query.get("config_type")
            
            prompt_manager = hass.data[DOMAIN].get("prompt_manager")
            if not prompt_manager:
                return web.json_response(
                    {"error": "Prompt manager not available"}, status=500
                )

            if config_type:
                prompts = await prompt_manager.get_prompts_by_type(config_type)
            else:
                prompts = await prompt_manager.get_all_prompts()

            # Convert prompts to JSON-serializable format
            result = []
            for prompt in prompts:
                result.append(prompt.to_dict())

            return web.json_response({"prompts": result})

        except Exception as err:
            _LOGGER.error("Error getting system prompts: %s", err)
            return web.json_response(
                {"error": str(err)}, status=500
            )
    
    async def post(self, request: Request) -> Response:
        """Create a new system prompt."""
        hass: HomeAssistant = request.app["hass"]
        
        try:
            data = await request.json()
            name = data.get("name", "")
            config_type = data.get("config_type", "")
            template = data.get("template", "")
            description = data.get("description", "")
            author = data.get("author", "")
            set_active = data.get("set_active", False)
            
            if not name or not config_type or not template:
                return web.json_response(
                    {"error": "Missing required fields: name, config_type, template"}, 
                    status=400
                )
            
            prompt_manager = hass.data[DOMAIN].get("prompt_manager")
            if not prompt_manager:
                return web.json_response(
                    {"error": "Prompt manager not available"}, status=500
                )

            prompt = await prompt_manager.create_prompt(
                name=name,
                config_type=config_type,
                template=template,
                description=description,
                author=author,
                set_active=set_active
            )

            return web.json_response({
                "success": True,
                "prompt": prompt.to_dict()
            })

        except ValueError as err:
            return web.json_response(
                {"error": str(err)}, status=400
            )
        except Exception as err:
            _LOGGER.error("Error creating system prompt: %s", err)
            return web.json_response(
                {"error": str(err)}, status=500
            )


class SystemPromptView(HomeAssistantView):
    """View for individual system prompt management API."""
    
    url = "/api/ai_config_assistant/prompts/{prompt_id}"
    name = "api:ai_config_assistant:prompt"
    requires_auth = True

    async def get(self, request: Request) -> Response:
        """Get a specific system prompt."""
        hass: HomeAssistant = request.app["hass"]
        prompt_id = request.match_info["prompt_id"]
        
        try:
            prompt_manager = hass.data[DOMAIN].get("prompt_manager")
            if not prompt_manager:
                return web.json_response(
                    {"error": "Prompt manager not available"}, status=500
                )

            prompt = await prompt_manager.get_prompt(prompt_id)
            if not prompt:
                return web.json_response(
                    {"error": "Prompt not found"}, status=404
                )

            return web.json_response({"prompt": prompt.to_dict()})

        except Exception as err:
            _LOGGER.error("Error getting system prompt: %s", err)
            return web.json_response(
                {"error": str(err)}, status=500
            )
    
    async def put(self, request: Request) -> Response:
        """Update a system prompt."""
        hass: HomeAssistant = request.app["hass"]
        prompt_id = request.match_info["prompt_id"]
        
        try:
            data = await request.json()
            
            prompt_manager = hass.data[DOMAIN].get("prompt_manager")
            if not prompt_manager:
                return web.json_response(
                    {"error": "Prompt manager not available"}, status=500
                )

            prompt = await prompt_manager.update_prompt(
                prompt_id=prompt_id,
                name=data.get("name"),
                template=data.get("template"),
                description=data.get("description"),
                set_active=data.get("set_active")
            )

            return web.json_response({
                "success": True,
                "prompt": prompt.to_dict()
            })

        except ValueError as err:
            return web.json_response(
                {"error": str(err)}, status=400
            )
        except Exception as err:
            _LOGGER.error("Error updating system prompt: %s", err)
            return web.json_response(
                {"error": str(err)}, status=500
            )
    
    async def delete(self, request: Request) -> Response:
        """Delete a system prompt."""
        hass: HomeAssistant = request.app["hass"]
        prompt_id = request.match_info["prompt_id"]
        
        try:
            prompt_manager = hass.data[DOMAIN].get("prompt_manager")
            if not prompt_manager:
                return web.json_response(
                    {"error": "Prompt manager not available"}, status=500
                )

            success = await prompt_manager.delete_prompt(prompt_id)
            if not success:
                return web.json_response(
                    {"error": "Prompt not found"}, status=404
                )

            return web.json_response({"success": True})

        except ValueError as err:
            return web.json_response(
                {"error": str(err)}, status=400
            )
        except Exception as err:
            _LOGGER.error("Error deleting system prompt: %s", err)
            return web.json_response(
                {"error": str(err)}, status=500
            )


class SystemPromptPreviewView(HomeAssistantView):
    """View for system prompt preview API."""
    
    url = "/api/ai_config_assistant/prompts/{prompt_id}/preview"
    name = "api:ai_config_assistant:prompt_preview"
    requires_auth = True

    async def post(self, request: Request) -> Response:
        """Preview a system prompt with sample data."""
        hass: HomeAssistant = request.app["hass"]
        prompt_id = request.match_info["prompt_id"]
        
        try:
            data = await request.json()
            sample_data = data.get("sample_data")
            
            prompt_manager = hass.data[DOMAIN].get("prompt_manager")
            if not prompt_manager:
                return web.json_response(
                    {"error": "Prompt manager not available"}, status=500
                )

            preview = await prompt_manager.preview_prompt(
                prompt_id=prompt_id,
                sample_data=sample_data
            )

            return web.json_response({
                "success": True,
                "preview": preview
            })

        except ValueError as err:
            return web.json_response(
                {"error": str(err)}, status=400
            )
        except Exception as err:
            _LOGGER.error("Error previewing system prompt: %s", err)
            return web.json_response(
                {"error": str(err)}, status=500
            )


class SystemPromptActiveView(HomeAssistantView):
    """View for active system prompt management API."""
    
    url = "/api/ai_config_assistant/prompts/active/{config_type}"
    name = "api:ai_config_assistant:prompt_active"
    requires_auth = True

    async def get(self, request: Request) -> Response:
        """Get the active prompt for a config type."""
        hass: HomeAssistant = request.app["hass"]
        config_type = request.match_info["config_type"]
        
        try:
            prompt_manager = hass.data[DOMAIN].get("prompt_manager")
            if not prompt_manager:
                return web.json_response(
                    {"error": "Prompt manager not available"}, status=500
                )

            prompt = await prompt_manager.get_active_prompt(config_type)
            if not prompt:
                return web.json_response(
                    {"error": "No active prompt found"}, status=404
                )

            return web.json_response({"prompt": prompt.to_dict()})

        except Exception as err:
            _LOGGER.error("Error getting active system prompt: %s", err)
            return web.json_response(
                {"error": str(err)}, status=500
            )
    
    async def put(self, request: Request) -> Response:
        """Set the active prompt for a config type."""
        hass: HomeAssistant = request.app["hass"]
        config_type = request.match_info["config_type"]
        
        try:
            data = await request.json()
            prompt_id = data.get("prompt_id")
            
            if not prompt_id:
                return web.json_response(
                    {"error": "Missing prompt_id"}, status=400
                )
            
            prompt_manager = hass.data[DOMAIN].get("prompt_manager")
            if not prompt_manager:
                return web.json_response(
                    {"error": "Prompt manager not available"}, status=500
                )

            success = await prompt_manager.set_active_prompt(config_type, prompt_id)
            if not success:
                return web.json_response(
                    {"error": "Failed to set active prompt"}, status=400
                )

            return web.json_response({"success": True})

        except ValueError as err:
            return web.json_response(
                {"error": str(err)}, status=400
            )
        except Exception as err:
            _LOGGER.error("Error setting active system prompt: %s", err)
            return web.json_response(
                {"error": str(err)}, status=500
            )


async def async_register_api_views(hass: HomeAssistant) -> None:
    """Register API views."""
    try:
        hass.http.register_view(EntitySuggestionsView())
        hass.http.register_view(ConfigGenerationView())
        hass.http.register_view(ConfigValidationView())
        hass.http.register_view(ConfigPreviewView())
        hass.http.register_view(EntitiesView())
        
        # Register system prompt management views
        hass.http.register_view(SystemPromptsView())
        hass.http.register_view(SystemPromptView())
        hass.http.register_view(SystemPromptPreviewView())
        hass.http.register_view(SystemPromptActiveView())
        
        _LOGGER.info("AI Configuration Assistant API views registered")
        
    except Exception as err:
        _LOGGER.error("Failed to register API views: %s", err)