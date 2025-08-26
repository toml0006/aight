"""AI Configuration Assistant integration for Home Assistant."""
import asyncio
import json
import logging
import time
import re
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
    CONF_AUTO_LABEL,
    SERVICE_GENERATE_CONFIG,
    SERVICE_VALIDATE_CONFIG,
    SERVICE_PREVIEW_CONFIG,
    SERVICE_RELOAD,
    SERVICE_DEPLOY_CONFIG,
    LLM_PROVIDERS,
)
from .llm_client import LLMClientManager
from .config_generator import ConfigGenerator
from .entity_manager import EntityManager
from .api import async_register_api_views
from .panel import async_register_panel
from .conversation_storage import ConversationStorage
from .websocket_api import async_setup_websocket_api

_LOGGER = logging.getLogger(__name__)

# AI_TASK platform is optional - only add if available
PLATFORMS: list[Platform] = []

# Check if AI_TASK platform is available in this HA version
try:
    from homeassistant.components.ai_task import AITaskEntity
    # Try to access the AI_TASK platform
    if hasattr(Platform, 'AI_TASK'):
        PLATFORMS.append(Platform.AI_TASK)
        _LOGGER.info("✅ AI Task platform available, will register entity")
    else:
        _LOGGER.info("⚠️ AI Task platform constant not available in this Home Assistant version")
except (AttributeError, ImportError):
    _LOGGER.info("⚠️ AI Task platform not available in this Home Assistant version")

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
        _LOGGER.warning("Initializing AI Config Assistant components...")
        hass.data[DOMAIN]["llm_client"] = LLMClientManager(hass)
        hass.data[DOMAIN]["config_generator"] = ConfigGenerator(hass)
        hass.data[DOMAIN]["entity_manager"] = EntityManager(hass)
        hass.data[DOMAIN]["conversation_storage"] = ConversationStorage(hass)
        
        _LOGGER.warning("Components created, initializing entity manager...")
        # Initialize entity manager
        await hass.data[DOMAIN]["entity_manager"].initialize()
        
        _LOGGER.warning("Setting up config generator...")
        # Set up config generator with conversation agent support if configured
        use_conversation_agent = entry.data.get("use_conversation_agent", False)
        conversation_agent_id = entry.data.get("conversation_agent_id")
        
        hass.data[DOMAIN]["config_generator"].setup(
            hass.data[DOMAIN]["llm_client"],
            hass.data[DOMAIN]["entity_manager"],
            use_conversation_agent=use_conversation_agent,
            conversation_agent_id=conversation_agent_id
        )
        
        _LOGGER.warning("Config generator setup complete, registering services...")
        # Register services
        await _async_register_services(hass)
        _LOGGER.warning("Services registered successfully")
        
        # Register API endpoints
        await async_register_api_views(hass)
        
        # Register WebSocket API for conversation management
        await async_setup_websocket_api(hass)
        
        # Register frontend panel
        await async_register_panel(hass)
        
        # Set up entity lifecycle monitoring
        await _setup_entity_lifecycle_monitoring(hass)
    
    # Forward entry setup to platforms (AI Task entity)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    
    # Initialize LLM client with config (only if not using conversation agent)
    if not entry.data.get("use_conversation_agent", False):
        llm_client = hass.data[DOMAIN]["llm_client"]
        await llm_client.setup(
            provider=entry.data.get(CONF_LLM_PROVIDER, "openai"),
            api_key=entry.data.get(CONF_API_KEY, ""),
            default_model=entry.data.get(CONF_DEFAULT_MODEL),
        )
    else:
        _LOGGER.info("Using conversation agent instead of direct LLM")
    
    _LOGGER.info("AI Configuration Assistant integration loaded successfully")
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload AI Config Assistant config entry."""
    # Unload platforms
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    
    # Clean up resources
    if unload_ok and DOMAIN in hass.data:
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
    
    return unload_ok

def _generate_human_readable_id(base_text: str, entity_type: str, hass: HomeAssistant) -> str:
    """Generate a human-readable ID from text, ensuring uniqueness."""
    # Clean up the text to make a valid ID
    # Remove "AI Generated" prefix if present
    cleaned = re.sub(r'^(ai\s+generated?\s+)', '', base_text, flags=re.IGNORECASE)
    
    # Convert to lowercase and replace spaces/special chars with underscores
    cleaned = cleaned.lower()
    cleaned = re.sub(r'[^\w\s-]', '', cleaned)  # Remove special chars except underscore and hyphen
    cleaned = re.sub(r'[-\s]+', '_', cleaned)  # Replace spaces and hyphens with underscores
    cleaned = re.sub(r'_+', '_', cleaned)  # Remove duplicate underscores
    cleaned = cleaned.strip('_')  # Remove leading/trailing underscores
    
    # Limit length to something reasonable
    if len(cleaned) > 50:
        # Try to cut at a word boundary
        cleaned = cleaned[:50]
        last_underscore = cleaned.rfind('_')
        if last_underscore > 30:  # Keep at least 30 chars
            cleaned = cleaned[:last_underscore]
    
    # Ensure it starts with a letter (required for entity IDs)
    if cleaned and not cleaned[0].isalpha():
        cleaned = f"{entity_type}_{cleaned}"
    elif not cleaned:
        cleaned = f"{entity_type}_ai_generated"
    
    # Check for collisions and add a number if needed
    base_id = cleaned
    counter = 1
    
    # Check if ID already exists
    while True:
        test_id = base_id if counter == 1 else f"{base_id}_{counter}"
        full_entity_id = f"{entity_type}.{test_id}"
        
        # Check if this entity already exists
        if entity_type == "automation":
            # Check automations
            automations = hass.states.async_entity_ids("automation")
            if full_entity_id not in automations:
                return test_id
        elif entity_type == "script":
            # Check scripts
            scripts = hass.states.async_entity_ids("script")
            if full_entity_id not in scripts:
                return test_id
        elif entity_type == "scene":
            # Check scenes
            scenes = hass.states.async_entity_ids("scene")
            if full_entity_id not in scenes:
                return test_id
        else:
            # For other types, just return with counter
            return test_id
            
        counter += 1
        if counter > 99:
            # Fallback to timestamp if we can't find a unique ID
            return f"{base_id}_{int(time.time())}"

async def _apply_label_to_entity(hass: HomeAssistant, entity_id: str, label: str) -> None:
    """Apply a label to an entity if labels are configured."""
    if not label:
        return
        
    try:
        # First, ensure the label exists in the label registry
        from homeassistant.helpers import label_registry as lr, entity_registry as er
        
        label_registry = lr.async_get(hass)
        entity_registry = er.async_get(hass)
        
        # Create or get the label
        existing_label = None
        for label_entry in label_registry.labels.values():
            if label_entry.name == label:
                existing_label = label_entry
                break
        
        if not existing_label:
            # Create the label with the AIGHT icon
            _LOGGER.info("Creating new label: %s", label)
            existing_label = label_registry.async_create(
                name=label,
                icon="mdi:star-shooting-outline"  # Use the same icon as the panel
            )
        
        # Get the entity registry entry
        entity_entry = entity_registry.async_get(entity_id)
        if entity_entry:
            # Update the entity with the label
            current_labels = set(entity_entry.labels or [])
            current_labels.add(existing_label.label_id)
            
            entity_registry.async_update_entity(
                entity_id, 
                labels=current_labels
            )
            _LOGGER.info("Applied label '%s' to entity '%s'", label, entity_id)
        else:
            # Entity not found in registry yet - it might be created later
            # Schedule a retry in a few seconds
            _LOGGER.warning("Entity %s not found in registry yet, scheduling retry", entity_id)
            
            async def retry_label_application():
                await asyncio.sleep(3)  # Wait for entity to be registered
                entity_entry = entity_registry.async_get(entity_id)
                if entity_entry:
                    current_labels = set(entity_entry.labels or [])
                    current_labels.add(existing_label.label_id)
                    entity_registry.async_update_entity(
                        entity_id, 
                        labels=current_labels
                    )
                    _LOGGER.info("Applied label '%s' to entity '%s' (delayed)", label, entity_id)
                else:
                    _LOGGER.warning("Entity %s still not found after retry", entity_id)
            
            # Schedule the retry
            hass.async_create_task(retry_label_application())
            
    except Exception as e:
        _LOGGER.error("Failed to apply label '%s' to %s: %s", label, entity_id, e)

async def _deploy_dashboard(hass: HomeAssistant, config_data: dict, config_yaml: str) -> dict:
    """Deploy dashboard configuration to Home Assistant."""
    import json
    
    try:
        _LOGGER.info("Deploying dashboard configuration")
        _LOGGER.info("Config data keys: %s", list(config_data.keys()))
        _LOGGER.info("Config data: %s", json.dumps(config_data, indent=2)[:500])
        
        # Determine if this is a new view or a complete dashboard
        if "views" in config_data:
            # This is a complete dashboard configuration
            dashboard_config = config_data
            view_path = config_data["views"][0].get("path", "") if config_data["views"] else ""
            _LOGGER.info("Deploying complete dashboard with %d views", len(config_data.get("views", [])))
        elif "cards" in config_data:
            # This is a single view - wrap it in a dashboard structure
            view_config = {
                "title": config_data.get("title", "AI Generated View"),
                "path": config_data.get("path", f"ai_view_{int(time.time())}"),
                "cards": config_data.get("cards", [])
            }
            dashboard_config = {"views": [view_config]}
            view_path = view_config.get("path", "")
            _LOGGER.info("Creating view: %s with path: %s", view_config.get("title"), view_path)
        else:
            # Single card - create a view for it
            card_config = config_data
            timestamp = int(time.time())
            view_path = f"ai_cards_{timestamp}"
            view_config = {
                "title": "AI Generated Dashboard",
                "path": view_path,
                "cards": [card_config]
            }
            dashboard_config = {"views": [view_config]}
            _LOGGER.info("Creating single card as view with path: %s", view_path)
        
        # Since we can't directly access lovelace component, we'll write to storage
        # This is the most reliable method for dashboard deployment
        return await _deploy_dashboard_to_storage(hass, dashboard_config, view_path)
            
    except Exception as e:
        _LOGGER.error("Error deploying dashboard: %s", e)
        return {
            "success": False,
            "error": f"Failed to deploy dashboard: {str(e)}"
        }

async def _deploy_dashboard_to_storage(hass: HomeAssistant, new_config: dict, view_path: str = "") -> dict:
    """Deploy dashboard by writing to .storage/lovelace file."""
    import json
    import os
    import aiofiles
    
    try:
        # Get the storage path
        storage_dir = hass.config.path(".storage")
        lovelace_path = os.path.join(storage_dir, "lovelace")
        
        _LOGGER.info("Writing dashboard to storage: %s", lovelace_path)
        
        # Try to read existing configuration
        existing_config = None
        if os.path.exists(lovelace_path):
            try:
                async with aiofiles.open(lovelace_path, 'r') as f:
                    content = await f.read()
                    existing_data = json.loads(content)
                    existing_config = existing_data.get("data", {}).get("config", {})
                    _LOGGER.info("Loaded existing dashboard with %d views", len(existing_config.get("views", [])))
            except Exception as e:
                _LOGGER.warning("Could not load existing dashboard: %s", e)
        
        # Merge configurations
        if existing_config and "views" in existing_config:
            # Add new views to existing dashboard
            if "views" in new_config:
                for new_view in new_config["views"]:
                    # Check if view with same path exists
                    existing_paths = [v.get("path", "") for v in existing_config["views"]]
                    if new_view.get("path") in existing_paths:
                        # Update existing view
                        for i, view in enumerate(existing_config["views"]):
                            if view.get("path") == new_view.get("path"):
                                existing_config["views"][i] = new_view
                                _LOGGER.info("Updated existing view: %s", new_view.get("path"))
                                break
                    else:
                        # Add new view
                        existing_config["views"].append(new_view)
                        _LOGGER.info("Added new view: %s", new_view.get("path"))
                dashboard_config = existing_config
            else:
                dashboard_config = new_config
        else:
            # Use new config as is
            dashboard_config = new_config
        
        # Create storage structure
        storage_data = {
            "version": 1,
            "minor_version": 1,
            "key": "lovelace",
            "data": {
                "config": dashboard_config
            }
        }
        
        # Write to file
        async with aiofiles.open(lovelace_path, 'w') as f:
            await f.write(json.dumps(storage_data, indent=2))
        
        _LOGGER.info("Dashboard written to storage")
        _LOGGER.info("Total views in dashboard: %d", len(dashboard_config.get("views", [])))
        _LOGGER.info("View path for link: %s", view_path)
        
        # Notify frontend to reload
        hass.bus.async_fire("lovelace_updated", {"url_path": None})
        
        _LOGGER.info("Dashboard reload triggered")
        _LOGGER.info("To view the dashboard, navigate to: /lovelace/%s", view_path)
        
        return {
            "success": True,
            "message": "Dashboard deployed successfully",
            "path": view_path,
            "type": "dashboard",
            "view_count": len(dashboard_config.get("views", []))
        }
        
    except Exception as e:
        _LOGGER.error("Failed to write dashboard to storage: %s", e)
        return {
            "success": False,
            "error": f"Failed to deploy dashboard: {str(e)}"
        }

async def _deploy_template_sensor(hass: HomeAssistant, sensor_config: dict, sensor_type: str) -> dict:
    """Deploy template sensor to Home Assistant."""
    import yaml
    import os
    import aiofiles
    
    try:
        # Get the configuration directory
        config_dir = hass.config.config_dir
        
        # Template sensors go in configuration.yaml or a separate file
        # For simplicity, we'll create a template_sensors.yaml file
        template_file = os.path.join(config_dir, "template_sensors.yaml")
        
        _LOGGER.info("Deploying template sensor: %s", sensor_config.get("name"))
        
        # Read existing template sensors
        templates = []
        if os.path.exists(template_file):
            async with aiofiles.open(template_file, 'r') as f:
                content = await f.read()
                if content:
                    templates = yaml.safe_load(content) or []
        
        # Create sensor configuration structure
        sensor_name = sensor_config.get("name", f"ai_sensor_{int(time.time())}")
        friendly_name = sensor_config.get("friendly_name", sensor_name.replace("_", " ").title())
        
        new_sensor = {
            "sensor": {
                sensor_name: {
                    "friendly_name": friendly_name,
                    "value_template": sensor_config.get("value_template", "{{ 0 }}"),
                }
            }
        }
        
        # Add optional fields
        if "unit_of_measurement" in sensor_config:
            new_sensor["sensor"][sensor_name]["unit_of_measurement"] = sensor_config["unit_of_measurement"]
        if "icon" in sensor_config:
            new_sensor["sensor"][sensor_name]["icon"] = sensor_config["icon"]
        if "device_class" in sensor_config:
            new_sensor["sensor"][sensor_name]["device_class"] = sensor_config["device_class"]
        if "attributes" in sensor_config:
            new_sensor["sensor"][sensor_name]["attribute_templates"] = sensor_config["attributes"]
        
        # Add to templates list
        templates.append(new_sensor)
        
        # Write back to file
        async with aiofiles.open(template_file, 'w') as f:
            await f.write(yaml.dump(templates, default_flow_style=False, allow_unicode=True))
        
        # Note: Template sensors require a configuration reload to take effect
        # We'll need to inform the user to reload template entities
        
        _LOGGER.info("Template sensor written to %s", template_file)
        
        return {
            "success": True,
            "message": f"Template sensor '{sensor_name}' deployed. Please reload Template Entities to activate it.",
            "entity_id": f"sensor.{sensor_name}",
            "requires_reload": True,
            "reload_domain": "template"
        }
        
    except Exception as e:
        _LOGGER.error("Failed to deploy template sensor: %s", e)
        return {
            "success": False,
            "error": f"Failed to deploy template sensor: {str(e)}"
        }

async def _deploy_helper(hass: HomeAssistant, helper_config: dict, helper_type: str) -> dict:
    """Deploy helper (input entity) to Home Assistant."""
    try:
        # Determine the actual helper type
        if helper_type == "helper":
            # If generic "helper" was specified, get the actual type from config
            actual_type = helper_config.get("type", "input_boolean")
        elif helper_type.startswith("input_"):
            actual_type = helper_type
        else:
            actual_type = f"input_{helper_type}"
        
        # Extract configuration
        name = helper_config.get("name", f"ai_helper_{int(time.time())}")
        friendly_name = helper_config.get("friendly_name", name.replace("_", " ").title())
        icon = helper_config.get("icon")
        
        # Build service data based on helper type
        service_data = {
            "name": friendly_name,
        }
        
        if icon:
            service_data["icon"] = icon
        
        # Add type-specific configuration
        if actual_type == "input_boolean":
            # Input boolean has minimal configuration
            pass
            
        elif actual_type == "input_number":
            service_data["min"] = helper_config.get("min", 0)
            service_data["max"] = helper_config.get("max", 100)
            service_data["step"] = helper_config.get("step", 1)
            if "unit_of_measurement" in helper_config:
                service_data["unit_of_measurement"] = helper_config["unit_of_measurement"]
            if "mode" in helper_config:
                service_data["mode"] = helper_config["mode"]
            
        elif actual_type == "input_text":
            service_data["min_length"] = helper_config.get("min", 0)
            service_data["max_length"] = helper_config.get("max", 100)
            if "mode" in helper_config:
                service_data["mode"] = helper_config["mode"]
            if "pattern" in helper_config:
                service_data["pattern"] = helper_config["pattern"]
            
        elif actual_type == "input_select":
            options = helper_config.get("options", ["Option 1", "Option 2"])
            service_data["options"] = options
            
        elif actual_type == "input_datetime":
            service_data["has_date"] = helper_config.get("has_date", True)
            service_data["has_time"] = helper_config.get("has_time", True)
            
        elif actual_type == "input_button":
            # Input button has minimal configuration
            pass
        
        _LOGGER.info("Creating %s helper: %s", actual_type, name)
        _LOGGER.info("Service data: %s", service_data)
        
        # Call the appropriate service to create the helper
        try:
            # Create the helper using the appropriate service
            await hass.services.async_call(
                actual_type,
                "create",
                service_data,
                blocking=True
            )
            
            entity_id = f"{actual_type}.{name}"
            _LOGGER.info("Helper created successfully: %s", entity_id)
            
            return {
                "success": True,
                "message": f"Helper '{friendly_name}' created successfully",
                "entity_id": entity_id,
                "type": actual_type
            }
            
        except Exception as e:
            # If the create service doesn't exist, we need to use configuration.yaml
            _LOGGER.warning("Helper create service not available, needs manual configuration: %s", e)
            
            # Generate configuration for manual addition
            config_yaml = yaml.dump({actual_type: {name: service_data}}, default_flow_style=False)
            
            return {
                "success": False,
                "error": f"Helper creation requires manual configuration. Add this to configuration.yaml:\n\n{config_yaml}",
                "manual_config": config_yaml
            }
        
    except Exception as e:
        _LOGGER.error("Failed to deploy helper: %s", e)
        return {
            "success": False,
            "error": f"Failed to deploy helper: {str(e)}"
        }

async def _deploy_script_to_yaml(hass: HomeAssistant, script_config: dict, script_id: str) -> dict:
    """Deploy script by writing to scripts.yaml file."""
    import yaml
    import os
    import aiofiles
    
    try:
        # Get the scripts.yaml path
        config_dir = hass.config.config_dir
        scripts_path = os.path.join(config_dir, "scripts.yaml")
        
        _LOGGER.info("Writing script '%s' to %s", script_id, scripts_path)
        
        # Read existing scripts
        scripts = {}
        if os.path.exists(scripts_path):
            async with aiofiles.open(scripts_path, 'r') as f:
                content = await f.read()
                if content:
                    scripts = yaml.safe_load(content) or {}
        
        # Add new script with the provided ID as the key
        scripts[script_id] = script_config
        
        # Write back to file
        async with aiofiles.open(scripts_path, 'w') as f:
            await f.write(yaml.dump(scripts, default_flow_style=False, allow_unicode=True))
        
        # Reload scripts
        await hass.services.async_call(
            "script",
            "reload",
            blocking=True
        )
        
        _LOGGER.info("Script '%s' written to file and reloaded", script_id)
        
        return {
            "success": True,
            "message": f"Script '{script_config.get('alias', script_id)}' deployed and reloaded",
            "id": script_id,
            "entity_id": f"script.{script_id}"
        }
    except Exception as e:
        _LOGGER.error("Failed to write script to file: %s", e)
        return {
            "success": False,
            "error": f"Failed to deploy script: {str(e)}"
        }

async def _deploy_automation_to_yaml(hass: HomeAssistant, automation_config: dict) -> dict:
    """Deploy automation by writing to automations.yaml file."""
    import yaml
    import os
    import aiofiles
    
    try:
        # Get the automations.yaml path
        config_dir = hass.config.config_dir
        automations_path = os.path.join(config_dir, "automations.yaml")
        
        _LOGGER.info("Writing automation to %s", automations_path)
        
        # Read existing automations
        automations = []
        if os.path.exists(automations_path):
            async with aiofiles.open(automations_path, 'r') as f:
                content = await f.read()
                if content:
                    automations = yaml.safe_load(content) or []
        
        # Add new automation
        automations.append(automation_config)
        
        # Write back to file
        async with aiofiles.open(automations_path, 'w') as f:
            await f.write(yaml.dump(automations, default_flow_style=False, allow_unicode=True))
        
        # Reload automations
        await hass.services.async_call(
            "automation",
            "reload",
            blocking=True
        )
        
        _LOGGER.info("Automation written to file and reloaded")
        
        return {
            "success": True,
            "message": "Automation deployed to automations.yaml and reloaded",
            "id": automation_config["id"]
        }
    except Exception as e:
        _LOGGER.error("Failed to write automation to file: %s", e)
        return {
            "success": False,
            "error": f"Failed to deploy automation: {str(e)}"
        }

async def _setup_entity_lifecycle_monitoring(hass: HomeAssistant) -> None:
    """Set up monitoring for entity lifecycle events."""
    
    @callback
    def entity_removed_listener(event):
        """Handle entity removal events."""
        entity_id = event.data.get("entity_id")
        if not entity_id:
            return
            
        # Check if this entity is linked to any conversations
        async def archive_conversations():
            try:
                storage = hass.data[DOMAIN].get("conversation_storage")
                if not storage:
                    return
                    
                # We need to check all users, but we don't have access to user list here
                # For now, just log the entity removal
                _LOGGER.info("Entity %s was removed - conversations should be archived", entity_id)
                
                # TODO: Implement proper user iteration and archiving
                # This would require storing a global entity->conversation mapping
                # or iterating through all user storage files
                
            except Exception as e:
                _LOGGER.error("Failed to archive conversations for deleted entity %s: %s", entity_id, e)
        
        # Schedule the archiving task
        hass.async_create_task(archive_conversations())
    
    # Listen for entity removal events
    hass.bus.async_listen("entity_registry_updated", entity_removed_listener)
    _LOGGER.info("Entity lifecycle monitoring set up")

async def _auto_track_deployment(
    hass: HomeAssistant, 
    conversation_id: str, 
    entity_id: str, 
    config_type: str, 
    config_yaml: str
) -> None:
    """Automatically track a deployment if conversation_id is provided."""
    if not conversation_id:
        return
        
    try:
        storage = hass.data[DOMAIN].get("conversation_storage")
        if not storage:
            return
            
        # We need a user context, but since this is called from a service,
        # we don't have direct access to the user. For now, we'll skip
        # automatic tracking and rely on the frontend to call the link API
        _LOGGER.info(
            "Deployment successful: %s -> %s (conversation: %s)", 
            config_type, entity_id, conversation_id
        )
    except Exception as e:
        _LOGGER.error("Failed to auto-track deployment: %s", e)

async def _async_register_services(hass: HomeAssistant) -> None:
    """Register AI Config Assistant services."""
    
    async def generate_config_service(call: ServiceCall) -> ServiceResponse | None:
        """Generate configuration from natural language input."""
        # Log the service call for debugging
        _LOGGER.warning("=" * 50)
        _LOGGER.warning("AI Config Assistant Service Called")
        _LOGGER.warning("=" * 50)
        
        # Check if response is requested - check both the proper way and the data field
        # In HA 2025.7+, the return_response might come through the data dict
        wants_response = call.return_response or call.data.get('return_response', False)
        
        _LOGGER.warning("Prompt: %s", call.data.get('prompt', '')[:100])
        _LOGGER.warning("Type: %s", call.data.get('type', 'automation'))
        
        _LOGGER.warning("Return response requested: %s (call.return_response=%s, data.return_response=%s)", 
                       wants_response, call.return_response, call.data.get('return_response'))
        
        # Always try to return response data for compatibility with newer HA versions
        # Even if return_response isn't properly detected, we should still return data
        
        try:
            _LOGGER.warning("Checking for config_generator in hass.data...")
            config_generator = hass.data[DOMAIN].get("config_generator")
            if not config_generator:
                _LOGGER.error("Config generator not initialized - hass.data[DOMAIN] = %s", hass.data.get(DOMAIN, {}))
                error_response = {"success": False, "error": "Config generator not initialized"}
                _LOGGER.error("Returning error response: %s", error_response)
                return error_response
            
            prompt = call.data.get("prompt", "")
            config_type = call.data.get("type", "automation")
            context = call.data.get("context", {})
            include_entities = []
            
            _LOGGER.warning("Config generator found, proceeding with generation...")
            _LOGGER.warning("Generating %s for prompt: %s", config_type, prompt[:50] + "..." if len(prompt) > 50 else prompt)
            _LOGGER.warning("Config type received: '%s'", config_type)
            _LOGGER.warning("Number of entities received: %d", len(include_entities))
            _LOGGER.warning("First 5 entities: %s", include_entities[:5] if include_entities else "No entities")
            _LOGGER.warning("Include entities: %s", include_entities)
            
            result = await config_generator.generate_config(
                prompt=prompt,
                config_type=config_type,
                context=context,
                include_entities=include_entities,
            )
            
            _LOGGER.warning("Config generator returned: success=%s, has_config=%s", 
                          result.success, 
                          bool(result.config) if hasattr(result, 'config') else False)
            
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
            _LOGGER.warning("Full response data being returned: %s", json.dumps(response_data, indent=2)[:500])
            _LOGGER.warning("=" * 50)
            _LOGGER.warning("Response being sent back to frontend")
            _LOGGER.warning("=" * 50)
            return response_data
            
        except Exception as err:
            _LOGGER.error("=" * 50)
            _LOGGER.error("SERVICE CALL EXCEPTION OCCURRED!")
            _LOGGER.error("=" * 50)
            _LOGGER.error("Exception type: %s", type(err).__name__)
            _LOGGER.error("Exception message: %s", str(err))
            _LOGGER.error("Full exception details:", exc_info=True)
            
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
                "error_type": type(err).__name__,
            }
            _LOGGER.error("Returning error response: %s", json.dumps(error_response, indent=2))
            _LOGGER.error("=" * 50)
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
        conversation_id = call.data.get("conversation_id")  # Optional parameter for tracking
        
        try:
            # Parse the YAML
            config_data = yaml.safe_load(config_yaml)
            
            if config_type == "automation":
                # Ensure triggers, conditions, and actions are lists
                triggers = config_data.get("trigger", [])
                if not isinstance(triggers, list):
                    triggers = [triggers] if triggers else []
                
                conditions = config_data.get("condition", [])
                if not isinstance(conditions, list):
                    conditions = [conditions] if conditions else []
                    
                actions = config_data.get("action", [])
                if not isinstance(actions, list):
                    actions = [actions] if actions else []
                
                # Generate human-readable ID from alias
                alias = config_data.get("alias", "AI Generated Automation")
                automation_id = _generate_human_readable_id(alias, "automation", hass)
                
                # Get auto-label configuration
                config_entry = hass.data[DOMAIN].get("config_entry")
                auto_label = ""
                if config_entry:
                    auto_label = config_entry.options.get(CONF_AUTO_LABEL) or config_entry.data.get(CONF_AUTO_LABEL, "")
                
                # Add to automations
                automation_config = {
                    "id": automation_id,
                    "alias": alias,
                    "description": config_data.get("description", "Generated by AI Config Assistant"),
                    "trigger": triggers,
                    "condition": conditions,
                    "action": actions,
                    "mode": config_data.get("mode", "single"),
                }
                
                _LOGGER.info("Deploying automation: %s", automation_config)
                
                # Create the automation using Home Assistant's automation component
                try:
                    # Use the automation component's create service
                    await hass.services.async_call(
                        "automation",
                        "create",
                        automation_config,
                        blocking=True
                    )
                    
                    # Reload automations to make it visible
                    await hass.services.async_call(
                        "automation",
                        "reload",
                        blocking=True
                    )
                    
                    _LOGGER.info("Automation deployed and reloaded successfully")
                    
                    # Apply label if configured
                    if auto_label:
                        await _apply_label_to_entity(hass, f"automation.{automation_id}", auto_label)
                    
                    # Track deployment if conversation_id provided
                    await _auto_track_deployment(
                        hass, conversation_id, f"automation.{automation_id}", 
                        config_type, config_yaml
                    )
                    
                    return {
                        "success": True,
                        "message": "Automation deployed and activated successfully",
                        "id": automation_id,
                        "entity_id": f"automation.{automation_id}"
                    }
                except Exception as e:
                    _LOGGER.error("Failed to create automation: %s", e)
                    # Fallback: Try to write directly to automations.yaml
                    return await _deploy_automation_to_yaml(hass, automation_config)
                
            elif config_type == "script":
                # Deploy script
                script_alias = config_data.get("alias", "AI Generated Script")
                
                # Generate human-readable ID from alias
                script_id = _generate_human_readable_id(script_alias, "script", hass)
                
                # Get auto-label configuration
                config_entry = hass.data[DOMAIN].get("config_entry")
                auto_label = ""
                if config_entry:
                    auto_label = config_entry.options.get(CONF_AUTO_LABEL) or config_entry.data.get(CONF_AUTO_LABEL, "")
                
                script_config = {
                    "alias": script_alias,
                    "sequence": config_data.get("sequence", []),
                    "mode": config_data.get("mode", "single"),
                    "description": config_data.get("description", "Generated by AI Config Assistant")
                }
                
                _LOGGER.info("Deploying script: %s with ID: %s", script_alias, script_id)
                
                # Deploy the script by writing to scripts.yaml
                result = await _deploy_script_to_yaml(hass, script_config, script_id)
                
                # Apply label if configured and deployment successful
                if result.get("success") and auto_label:
                    await _apply_label_to_entity(hass, f"script.{script_id}", auto_label)
                
                # Track deployment if conversation_id provided and deployment successful
                if result.get("success"):
                    await _auto_track_deployment(
                        hass, conversation_id, f"script.{script_id}", 
                        config_type, config_yaml
                    )
                    # Add entity_id to result
                    result["entity_id"] = f"script.{script_id}"
                
                return result
                
            elif config_type == "scene":
                # Deploy scene
                scene_name = config_data.get("name", "AI Generated Scene")
                
                # Generate human-readable ID from name
                scene_id = _generate_human_readable_id(scene_name, "scene", hass)
                
                # Get auto-label configuration
                config_entry = hass.data[DOMAIN].get("config_entry")
                auto_label = ""
                if config_entry:
                    auto_label = config_entry.options.get(CONF_AUTO_LABEL) or config_entry.data.get(CONF_AUTO_LABEL, "")
                
                scene_config = {
                    "id": scene_id,
                    "name": scene_name,
                    "entities": config_data.get("entities", {}),
                }
                
                _LOGGER.info("Deploying scene: %s with ID: %s", scene_name, scene_id)
                
                # Apply label if configured
                if auto_label:
                    await _apply_label_to_entity(hass, f"scene.{scene_id}", auto_label)
                
                # Track deployment if conversation_id provided
                await _auto_track_deployment(
                    hass, conversation_id, f"scene.{scene_id}", 
                    config_type, config_yaml
                )
                
                return {
                    "success": True,
                    "message": "Scene deployed successfully",
                    "id": scene_id,
                    "entity_id": f"scene.{scene_id}"
                }
                
            elif config_type in ["dashboard", "lovelace"]:
                # Deploy dashboard/lovelace configuration
                return await _deploy_dashboard(hass, config_data, config_yaml)
                
            elif config_type in ["sensor", "binary_sensor", "template"]:
                # Deploy template sensor
                return await _deploy_template_sensor(hass, config_data, config_type)
                
            elif config_type in ["helper", "input_boolean", "input_number", "input_text", "input_select", "input_datetime", "input_button"]:
                # Deploy helper/input entity
                return await _deploy_helper(hass, config_data, config_type)
                
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
    
    async def generate_via_ai_task(call: ServiceCall) -> ServiceResponse | None:
        """Generate configuration using the AI Task entity."""
        _LOGGER.info("AI Task generation service called")
        
        # Get the AI Task entity if it exists
        ai_task_entity = hass.data[DOMAIN].get("ai_task_entity")
        if not ai_task_entity:
            return {"success": False, "error": "AI Task entity not available"}
        
        instruction = call.data.get("instruction", "")
        if not instruction:
            return {"success": False, "error": "No instruction provided"}
        
        try:
            # Create a GenDataTask
            from homeassistant.components.ai_task import GenDataTask
            task = GenDataTask(
                instruction=instruction,
                output_schema=call.data.get("schema"),
            )
            
            # Generate the configuration
            result = await ai_task_entity._async_generate_data(task, None)
            
            if result.error:
                return {"success": False, "error": result.error}
            
            return {
                "success": True,
                "data": result.data,
            }
            
        except Exception as err:
            _LOGGER.error("Error in AI Task generation: %s", err)
            return {"success": False, "error": str(err)}
    
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

    # Register services
    _LOGGER.warning("Registering generate_config service with supports_response=SupportsResponse.OPTIONAL")
    hass.services.async_register(
        DOMAIN, SERVICE_GENERATE_CONFIG, generate_config_service,
        supports_response=SupportsResponse.OPTIONAL
    )
    _LOGGER.warning("generate_config service registered successfully")
    
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
    
    # Register AI Task generation service
    hass.services.async_register(
        DOMAIN, "generate_with_ai_task", generate_via_ai_task,
        supports_response=SupportsResponse.OPTIONAL
    )
    _LOGGER.info("AI Task generation service registered")
    
    async def get_last_system_prompt(call: ServiceCall) -> ServiceResponse | None:
        """Get the last system prompt that was sent to the LLM."""
        from .config_generator import LAST_SYSTEM_PROMPT
        _LOGGER.info(f"LAST_SYSTEM_PROMPT:\n{LAST_SYSTEM_PROMPT}")
        return {"system_prompt": LAST_SYSTEM_PROMPT}

    hass.services.async_register(
        DOMAIN, "get_last_system_prompt", get_last_system_prompt,
        supports_response=SupportsResponse.OPTIONAL
    )

    # Add a simple test service to verify response handling
    async def test_service(call: ServiceCall) -> ServiceResponse | None:
        """Test service to verify response handling."""
        _LOGGER.warning("Test service called!")
        test_response = {
            "success": True,
            "message": "Test service is working",
            "timestamp": time.time(),
            "data": call.data
        }
        _LOGGER.warning("Test service returning: %s", test_response)
        return test_response
    
    hass.services.async_register(
        DOMAIN, "test_response", test_service,
        supports_response=SupportsResponse.OPTIONAL
    )
    _LOGGER.warning("Test service registered")