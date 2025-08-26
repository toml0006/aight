"""WebSocket API for conversation management."""
import logging
from typing import Any, Dict, Optional
import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN
from .conversation_storage import ConversationStorage

_LOGGER = logging.getLogger(__name__)


async def async_setup_websocket_api(hass: HomeAssistant) -> None:
    """Set up the websocket API."""
    websocket_api.async_register_command(hass, websocket_load_conversations)
    websocket_api.async_register_command(hass, websocket_save_conversation)
    websocket_api.async_register_command(hass, websocket_delete_conversation)
    websocket_api.async_register_command(hass, websocket_migrate_conversations)
    websocket_api.async_register_command(hass, websocket_link_deployment)
    websocket_api.async_register_command(hass, websocket_unlink_deployment)
    websocket_api.async_register_command(hass, websocket_get_entity_status)
    websocket_api.async_register_command(hass, websocket_save_config_version)
    websocket_api.async_register_command(hass, websocket_restore_config_version)
    websocket_api.async_register_command(hass, websocket_get_version_history)
    _LOGGER.info("WebSocket API registered for conversation management")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_config_assistant/load_conversations",
    }
)
@websocket_api.async_response
async def websocket_load_conversations(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: Dict[str, Any],
) -> None:
    """Load conversations for the current user."""
    storage: ConversationStorage = hass.data[DOMAIN].get("conversation_storage")
    if not storage:
        connection.send_error(msg["id"], "storage_not_initialized", "Conversation storage not initialized")
        return
    
    user = connection.user
    if not user:
        connection.send_error(msg["id"], "no_user", "No user context available")
        return
    
    try:
        conversations = await storage.async_load_conversations(user)
        connection.send_result(msg["id"], {"conversations": conversations})
    except Exception as e:
        _LOGGER.error("Failed to load conversations: %s", e)
        connection.send_error(msg["id"], "load_failed", str(e))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_config_assistant/save_conversation",
        vol.Required("conversation"): dict,
    }
)
@websocket_api.async_response
async def websocket_save_conversation(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: Dict[str, Any],
) -> None:
    """Save a conversation for the current user."""
    storage: ConversationStorage = hass.data[DOMAIN].get("conversation_storage")
    if not storage:
        connection.send_error(msg["id"], "storage_not_initialized", "Conversation storage not initialized")
        return
    
    user = connection.user
    if not user:
        connection.send_error(msg["id"], "no_user", "No user context available")
        return
    
    try:
        conversation = msg["conversation"]
        success = await storage.async_save_conversation(user, conversation)
        if success:
            connection.send_result(msg["id"], {"success": True})
        else:
            connection.send_error(msg["id"], "save_failed", "Failed to save conversation")
    except Exception as e:
        _LOGGER.error("Failed to save conversation: %s", e)
        connection.send_error(msg["id"], "save_failed", str(e))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_config_assistant/delete_conversation",
        vol.Required("conversation_id"): cv.string,
    }
)
@websocket_api.async_response
async def websocket_delete_conversation(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: Dict[str, Any],
) -> None:
    """Delete a conversation for the current user."""
    storage: ConversationStorage = hass.data[DOMAIN].get("conversation_storage")
    if not storage:
        connection.send_error(msg["id"], "storage_not_initialized", "Conversation storage not initialized")
        return
    
    user = connection.user
    if not user:
        connection.send_error(msg["id"], "no_user", "No user context available")
        return
    
    try:
        conversation_id = msg["conversation_id"]
        success = await storage.async_delete_conversation(user, conversation_id)
        if success:
            connection.send_result(msg["id"], {"success": True})
        else:
            connection.send_error(msg["id"], "delete_failed", "Conversation not found")
    except Exception as e:
        _LOGGER.error("Failed to delete conversation: %s", e)
        connection.send_error(msg["id"], "delete_failed", str(e))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_config_assistant/migrate_conversations",
        vol.Required("conversations"): [dict],
    }
)
@websocket_api.async_response
async def websocket_migrate_conversations(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: Dict[str, Any],
) -> None:
    """Migrate conversations from localStorage to server storage."""
    storage: ConversationStorage = hass.data[DOMAIN].get("conversation_storage")
    if not storage:
        connection.send_error(msg["id"], "storage_not_initialized", "Conversation storage not initialized")
        return
    
    user = connection.user
    if not user:
        connection.send_error(msg["id"], "no_user", "No user context available")
        return
    
    try:
        conversations = msg["conversations"]
        success = await storage.async_migrate_from_localstorage(user, conversations)
        if success:
            # After successful migration, return the merged conversations
            merged_conversations = await storage.async_load_conversations(user)
            connection.send_result(msg["id"], {
                "success": True,
                "conversations": merged_conversations
            })
        else:
            connection.send_error(msg["id"], "migration_failed", "Failed to migrate conversations")
    except Exception as e:
        _LOGGER.error("Failed to migrate conversations: %s", e)
        connection.send_error(msg["id"], "migration_failed", str(e))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_config_assistant/link_deployment",
        vol.Required("conversation_id"): cv.string,
        vol.Required("entity_id"): cv.string,
        vol.Required("config_type"): cv.string,
        vol.Required("config_yaml"): cv.string,
        vol.Optional("deployment_method", default="manual"): cv.string,
    }
)
@websocket_api.async_response
async def websocket_link_deployment(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: Dict[str, Any],
) -> None:
    """Link a deployment to a conversation."""
    storage: ConversationStorage = hass.data[DOMAIN].get("conversation_storage")
    if not storage:
        connection.send_error(msg["id"], "storage_not_initialized", "Conversation storage not initialized")
        return
    
    user = connection.user
    if not user:
        connection.send_error(msg["id"], "no_user", "No user context available")
        return
    
    try:
        success = await storage.async_link_deployment(
            user=user,
            conversation_id=msg["conversation_id"],
            entity_id=msg["entity_id"],
            config_type=msg["config_type"],
            config_yaml=msg["config_yaml"],
            deployment_method=msg["deployment_method"]
        )
        
        if success:
            connection.send_result(msg["id"], {"success": True})
        else:
            connection.send_error(msg["id"], "link_failed", "Failed to link deployment")
    except Exception as e:
        _LOGGER.error("Failed to link deployment: %s", e)
        connection.send_error(msg["id"], "link_failed", str(e))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_config_assistant/unlink_deployment",
        vol.Required("conversation_id"): cv.string,
        vol.Required("entity_id"): cv.string,
    }
)
@websocket_api.async_response
async def websocket_unlink_deployment(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: Dict[str, Any],
) -> None:
    """Unlink a deployment from a conversation."""
    storage: ConversationStorage = hass.data[DOMAIN].get("conversation_storage")
    if not storage:
        connection.send_error(msg["id"], "storage_not_initialized", "Conversation storage not initialized")
        return
    
    user = connection.user
    if not user:
        connection.send_error(msg["id"], "no_user", "No user context available")
        return
    
    try:
        success = await storage.async_unlink_deployment(
            user=user,
            conversation_id=msg["conversation_id"],
            entity_id=msg["entity_id"]
        )
        
        if success:
            connection.send_result(msg["id"], {"success": True})
        else:
            connection.send_error(msg["id"], "unlink_failed", "Failed to unlink deployment")
    except Exception as e:
        _LOGGER.error("Failed to unlink deployment: %s", e)
        connection.send_error(msg["id"], "unlink_failed", str(e))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_config_assistant/get_entity_status",
        vol.Required("entity_id"): cv.string,
    }
)
@websocket_api.async_response
async def websocket_get_entity_status(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: Dict[str, Any],
) -> None:
    """Get the current status of an entity."""
    user = connection.user
    if not user:
        connection.send_error(msg["id"], "no_user", "No user context available")
        return
    
    # Check user permissions
    if not user.is_admin and not user.permissions.check_entity(msg["entity_id"], "read"):
        connection.send_error(msg["id"], "permission_denied", "Insufficient permissions")
        return
    
    try:
        entity_id = msg["entity_id"]
        state = hass.states.get(entity_id)
        
        if not state:
            connection.send_result(msg["id"], {
                "exists": False,
                "entity_id": entity_id
            })
            return
        
        # Get additional information based on entity type
        domain = entity_id.split(".")[0]
        additional_info = {}
        
        if domain == "automation":
            # Check if automation is enabled
            additional_info["enabled"] = state.state != "unavailable"
            additional_info["last_triggered"] = state.attributes.get("last_triggered")
            
        elif domain == "script":
            # Script status
            additional_info["enabled"] = state.state != "unavailable"
            additional_info["last_triggered"] = state.attributes.get("last_triggered")
            
        elif domain == "scene":
            # Scene information
            additional_info["enabled"] = True  # Scenes don't have enabled/disabled state
            
        connection.send_result(msg["id"], {
            "exists": True,
            "entity_id": entity_id,
            "state": state.state,
            "attributes": dict(state.attributes),
            "last_changed": state.last_changed.isoformat(),
            "last_updated": state.last_updated.isoformat(),
            **additional_info
        })
        
    except Exception as e:
        _LOGGER.error("Failed to get entity status: %s", e)
        connection.send_error(msg["id"], "status_failed", str(e))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_config_assistant/save_config_version",
        vol.Required("conversation_id"): cv.string,
        vol.Required("entity_id"): cv.string,
        vol.Required("config_yaml"): cv.string,
        vol.Optional("version_note", default=""): cv.string,
    }
)
@websocket_api.async_response
async def websocket_save_config_version(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: Dict[str, Any],
) -> None:
    """Save a new version of a configuration."""
    storage: ConversationStorage = hass.data[DOMAIN].get("conversation_storage")
    if not storage:
        connection.send_error(msg["id"], "storage_not_initialized", "Conversation storage not initialized")
        return
    
    user = connection.user
    if not user:
        connection.send_error(msg["id"], "no_user", "No user context available")
        return
    
    # Check user permissions
    if not user.is_admin and not user.permissions.check_entity(msg["entity_id"], "edit"):
        connection.send_error(msg["id"], "permission_denied", "Insufficient permissions")
        return
    
    try:
        success = await storage.async_save_config_version(
            user=user,
            conversation_id=msg["conversation_id"],
            entity_id=msg["entity_id"],
            config_yaml=msg["config_yaml"],
            version_note=msg["version_note"]
        )
        
        if success:
            connection.send_result(msg["id"], {"success": True})
        else:
            connection.send_error(msg["id"], "save_failed", "Failed to save config version")
    except Exception as e:
        _LOGGER.error("Failed to save config version: %s", e)
        connection.send_error(msg["id"], "save_failed", str(e))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_config_assistant/restore_config_version",
        vol.Required("conversation_id"): cv.string,
        vol.Required("entity_id"): cv.string,
        vol.Required("target_version"): int,
    }
)
@websocket_api.async_response
async def websocket_restore_config_version(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: Dict[str, Any],
) -> None:
    """Restore a specific version of a configuration."""
    storage: ConversationStorage = hass.data[DOMAIN].get("conversation_storage")
    if not storage:
        connection.send_error(msg["id"], "storage_not_initialized", "Conversation storage not initialized")
        return
    
    user = connection.user
    if not user:
        connection.send_error(msg["id"], "no_user", "No user context available")
        return
    
    # Check user permissions
    if not user.is_admin and not user.permissions.check_entity(msg["entity_id"], "edit"):
        connection.send_error(msg["id"], "permission_denied", "Insufficient permissions")
        return
    
    try:
        restored_config = await storage.async_restore_config_version(
            user=user,
            conversation_id=msg["conversation_id"],
            entity_id=msg["entity_id"],
            target_version=msg["target_version"]
        )
        
        if restored_config:
            connection.send_result(msg["id"], {
                "success": True,
                "config_yaml": restored_config
            })
        else:
            connection.send_error(msg["id"], "restore_failed", "Failed to restore config version")
    except Exception as e:
        _LOGGER.error("Failed to restore config version: %s", e)
        connection.send_error(msg["id"], "restore_failed", str(e))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ai_config_assistant/get_version_history",
        vol.Required("conversation_id"): cv.string,
        vol.Required("entity_id"): cv.string,
    }
)
@websocket_api.async_response
async def websocket_get_version_history(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: Dict[str, Any],
) -> None:
    """Get version history for a deployment."""
    storage: ConversationStorage = hass.data[DOMAIN].get("conversation_storage")
    if not storage:
        connection.send_error(msg["id"], "storage_not_initialized", "Conversation storage not initialized")
        return
    
    user = connection.user
    if not user:
        connection.send_error(msg["id"], "no_user", "No user context available")
        return
    
    try:
        conversations = await storage.async_load_conversations(user)
        conversation = None
        
        for conv in conversations:
            if conv.get("id") == msg["conversation_id"]:
                conversation = conv
                break
                
        if not conversation:
            connection.send_error(msg["id"], "conversation_not_found", "Conversation not found")
            return
            
        # Find the deployment
        deployments = conversation.get("deployments", [])
        target_deployment = None
        
        for deployment in deployments:
            if deployment.get("entity_id") == msg["entity_id"]:
                target_deployment = deployment
                break
                
        if not target_deployment:
            connection.send_error(msg["id"], "deployment_not_found", "Deployment not found")
            return
            
        version_history = target_deployment.get("version_history", [])
        current_version = {
            "version": target_deployment.get("version", 1),
            "config_yaml": target_deployment.get("config_yaml"),
            "saved_at": target_deployment.get("deployed_at"),
            "note": "Current version",
            "is_current": True
        }
        
        # Combine current version with history
        all_versions = [current_version] + version_history
        all_versions.sort(key=lambda x: x.get("version", 0), reverse=True)
        
        connection.send_result(msg["id"], {
            "versions": all_versions,
            "current_version": target_deployment.get("version", 1)
        })
        
    except Exception as e:
        _LOGGER.error("Failed to get version history: %s", e)
        connection.send_error(msg["id"], "history_failed", str(e))