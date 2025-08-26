"""Conversation storage manager for AI Configuration Assistant."""
import logging
import asyncio
from typing import Any, Dict, List, Optional
from datetime import datetime
import json

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.auth.models import User

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
STORAGE_KEY_PREFIX = f"{DOMAIN}_conversations"
MAX_CONVERSATIONS_PER_USER = 50


class ConversationStorage:
    """Manage conversation storage for users."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize conversation storage."""
        self.hass = hass
        self._stores: Dict[str, Store] = {}
        self._data_cache: Dict[str, Dict] = {}

    def _get_store(self, user_id: str) -> Store:
        """Get storage for a specific user."""
        if user_id not in self._stores:
            storage_key = f"{STORAGE_KEY_PREFIX}_{user_id}"
            self._stores[user_id] = Store(
                self.hass,
                STORAGE_VERSION,
                storage_key,
                private=True,  # User-specific data
                atomic_writes=True,
            )
        return self._stores[user_id]

    async def async_load_conversations(self, user: User) -> List[Dict[str, Any]]:
        """Load conversations for a user."""
        if not user:
            _LOGGER.warning("No user provided for loading conversations")
            return []
            
        user_id = user.id
        store = self._get_store(user_id)
        
        # Load from cache if available
        if user_id in self._data_cache:
            data = self._data_cache[user_id]
        else:
            # Load from storage
            data = await store.async_load()
            if data is None:
                data = {"conversations": []}
            self._data_cache[user_id] = data
        
        return data.get("conversations", [])

    async def async_save_conversation(
        self, 
        user: User, 
        conversation: Dict[str, Any]
    ) -> bool:
        """Save a conversation for a user."""
        if not user:
            _LOGGER.warning("No user provided for saving conversation")
            return False
            
        user_id = user.id
        store = self._get_store(user_id)
        
        # Load existing conversations
        conversations = await self.async_load_conversations(user)
        
        # Check if conversation with same ID exists
        existing_index = None
        for i, conv in enumerate(conversations):
            if conv.get("id") == conversation.get("id"):
                existing_index = i
                break
        
        # Update or add conversation
        if existing_index is not None:
            conversations[existing_index] = conversation
        else:
            # Add new conversation at the beginning
            conversations.insert(0, conversation)
            
            # Limit number of conversations
            if len(conversations) > MAX_CONVERSATIONS_PER_USER:
                conversations = conversations[:MAX_CONVERSATIONS_PER_USER]
        
        # Update cache and save
        data = {"conversations": conversations}
        self._data_cache[user_id] = data
        
        try:
            await store.async_save(data)
            return True
        except Exception as e:
            _LOGGER.error("Failed to save conversation: %s", e)
            return False

    async def async_delete_conversation(
        self, 
        user: User, 
        conversation_id: str
    ) -> bool:
        """Delete a conversation for a user."""
        if not user:
            _LOGGER.warning("No user provided for deleting conversation")
            return False
            
        user_id = user.id
        store = self._get_store(user_id)
        
        # Load existing conversations
        conversations = await self.async_load_conversations(user)
        
        # Filter out the conversation to delete
        original_count = len(conversations)
        conversations = [c for c in conversations if c.get("id") != conversation_id]
        
        if len(conversations) == original_count:
            _LOGGER.warning("Conversation %s not found for user %s", conversation_id, user_id)
            return False
        
        # Update cache and save
        data = {"conversations": conversations}
        self._data_cache[user_id] = data
        
        try:
            await store.async_save(data)
            return True
        except Exception as e:
            _LOGGER.error("Failed to delete conversation: %s", e)
            return False

    async def async_migrate_from_localstorage(
        self, 
        user: User, 
        conversations: List[Dict[str, Any]]
    ) -> bool:
        """Migrate conversations from localStorage to server storage."""
        if not user or not conversations:
            return False
            
        user_id = user.id
        store = self._get_store(user_id)
        
        # Load existing server-side conversations
        existing = await self.async_load_conversations(user)
        existing_ids = {c.get("id") for c in existing}
        
        # Merge conversations (avoid duplicates)
        merged = existing.copy()
        for conv in conversations:
            if conv.get("id") not in existing_ids:
                merged.append(conv)
        
        # Sort by timestamp (newest first)
        merged.sort(key=lambda c: c.get("timestamp", 0), reverse=True)
        
        # Limit to max conversations
        if len(merged) > MAX_CONVERSATIONS_PER_USER:
            merged = merged[:MAX_CONVERSATIONS_PER_USER]
        
        # Save merged conversations
        data = {"conversations": merged}
        self._data_cache[user_id] = data
        
        try:
            await store.async_save(data)
            _LOGGER.info("Migrated %d conversations for user %s", len(conversations), user_id)
            return True
        except Exception as e:
            _LOGGER.error("Failed to migrate conversations: %s", e)
            return False

    async def async_link_deployment(
        self,
        user: User,
        conversation_id: str,
        entity_id: str,
        config_type: str,
        config_yaml: str,
        deployment_method: str = "direct"
    ) -> bool:
        """Link a deployed entity to a conversation."""
        if not user:
            _LOGGER.warning("No user provided for linking deployment")
            return False
            
        conversations = await self.async_load_conversations(user)
        conversation = None
        
        for conv in conversations:
            if conv.get("id") == conversation_id:
                conversation = conv
                break
                
        if not conversation:
            _LOGGER.warning("Conversation %s not found for deployment linking", conversation_id)
            return False
            
        # Initialize deployments if not exists
        if "deployments" not in conversation:
            conversation["deployments"] = []
            
        # Create deployment record
        deployment = {
            "entity_id": entity_id,
            "type": config_type,
            "deployed_at": datetime.now().isoformat(),
            "deployment_method": deployment_method,
            "config_yaml": config_yaml,
            "status": "active",
            "version": 1,
            "linked_manually": deployment_method == "manual"
        }
        
        # Check if entity already linked
        existing_deployment = None
        for i, dep in enumerate(conversation["deployments"]):
            if dep.get("entity_id") == entity_id:
                existing_deployment = i
                break
                
        if existing_deployment is not None:
            # Update existing deployment with new version
            old_deployment = conversation["deployments"][existing_deployment]
            deployment["version"] = old_deployment.get("version", 1) + 1
            conversation["deployments"][existing_deployment] = deployment
        else:
            # Add new deployment
            conversation["deployments"].append(deployment)
            
        # Save conversation
        return await self.async_save_conversation(user, conversation)

    async def async_unlink_deployment(
        self,
        user: User,
        conversation_id: str,
        entity_id: str
    ) -> bool:
        """Unlink a deployment from a conversation."""
        if not user:
            _LOGGER.warning("No user provided for unlinking deployment")
            return False
            
        conversations = await self.async_load_conversations(user)
        conversation = None
        
        for conv in conversations:
            if conv.get("id") == conversation_id:
                conversation = conv
                break
                
        if not conversation:
            return False
            
        # Remove deployment
        deployments = conversation.get("deployments", [])
        conversation["deployments"] = [d for d in deployments if d.get("entity_id") != entity_id]
        
        return await self.async_save_conversation(user, conversation)

    async def async_archive_conversation_for_entity(
        self,
        user: User,
        entity_id: str
    ) -> bool:
        """Archive conversations when their linked entity is deleted."""
        if not user:
            _LOGGER.warning("No user provided for archiving conversation")
            return False
            
        conversations = await self.async_load_conversations(user)
        updated = False
        
        for conversation in conversations:
            deployments = conversation.get("deployments", [])
            for deployment in deployments:
                if deployment.get("entity_id") == entity_id:
                    # Mark conversation as archived
                    conversation["archived"] = True
                    conversation["archived_at"] = datetime.now().isoformat()
                    conversation["archived_reason"] = f"Entity {entity_id} was deleted"
                    
                    # Mark deployment as deleted
                    deployment["status"] = "deleted"
                    deployment["deleted_at"] = datetime.now().isoformat()
                    
                    updated = True
                    break
                    
        if updated:
            # Save all conversations
            user_id = user.id
            store = self._get_store(user_id)
            data = {"conversations": conversations}
            self._data_cache[user_id] = data
            
            try:
                await store.async_save(data)
                return True
            except Exception as e:
                _LOGGER.error("Failed to archive conversations: %s", e)
                return False
                
        return True  # No conversations needed archiving

    async def async_get_conversations_for_entity(
        self,
        user: User,
        entity_id: str
    ) -> List[Dict[str, Any]]:
        """Get all conversations linked to a specific entity."""
        if not user:
            return []
            
        conversations = await self.async_load_conversations(user)
        linked_conversations = []
        
        for conversation in conversations:
            deployments = conversation.get("deployments", [])
            for deployment in deployments:
                if deployment.get("entity_id") == entity_id:
                    linked_conversations.append(conversation)
                    break
                    
        return linked_conversations

    async def async_save_config_version(
        self,
        user: User,
        conversation_id: str,
        entity_id: str,
        config_yaml: str,
        version_note: str = ""
    ) -> bool:
        """Save a new version of a configuration."""
        if not user:
            return False
            
        conversations = await self.async_load_conversations(user)
        conversation = None
        
        for conv in conversations:
            if conv.get("id") == conversation_id:
                conversation = conv
                break
                
        if not conversation:
            return False
            
        # Find the deployment
        deployments = conversation.get("deployments", [])
        for deployment in deployments:
            if deployment.get("entity_id") == entity_id:
                # Initialize version history
                if "version_history" not in deployment:
                    deployment["version_history"] = []
                    
                # Save current version to history
                current_version = {
                    "version": deployment.get("version", 1),
                    "config_yaml": deployment.get("config_yaml"),
                    "saved_at": deployment.get("deployed_at"),
                    "note": "Previous version"
                }
                deployment["version_history"].append(current_version)
                
                # Update current version
                deployment["version"] = deployment.get("version", 1) + 1
                deployment["config_yaml"] = config_yaml
                deployment["deployed_at"] = datetime.now().isoformat()
                
                # Add new version to history
                new_version = {
                    "version": deployment["version"],
                    "config_yaml": config_yaml,
                    "saved_at": deployment["deployed_at"],
                    "note": version_note or f"Version {deployment['version']}"
                }
                deployment["version_history"].append(new_version)
                
                # Keep only last 10 versions
                if len(deployment["version_history"]) > 10:
                    deployment["version_history"] = deployment["version_history"][-10:]
                    
                break
                
        return await self.async_save_conversation(user, conversation)

    async def async_restore_config_version(
        self,
        user: User,
        conversation_id: str,
        entity_id: str,
        target_version: int
    ) -> Optional[str]:
        """Restore a specific version of a configuration."""
        if not user:
            return None
            
        conversations = await self.async_load_conversations(user)
        conversation = None
        
        for conv in conversations:
            if conv.get("id") == conversation_id:
                conversation = conv
                break
                
        if not conversation:
            return None
            
        # Find the deployment
        deployments = conversation.get("deployments", [])
        for deployment in deployments:
            if deployment.get("entity_id") == entity_id:
                version_history = deployment.get("version_history", [])
                
                # Find the target version
                target_config = None
                for version in version_history:
                    if version.get("version") == target_version:
                        target_config = version.get("config_yaml")
                        break
                        
                if target_config:
                    # Save current as new version before restoring
                    await self.async_save_config_version(
                        user, conversation_id, entity_id,
                        deployment.get("config_yaml", ""),
                        f"Before restoring to version {target_version}"
                    )
                    
                    # Update current version
                    deployment["config_yaml"] = target_config
                    deployment["deployed_at"] = datetime.now().isoformat()
                    deployment["version"] = deployment.get("version", 1) + 1
                    
                    await self.async_save_conversation(user, conversation)
                    return target_config
                    
        return None

    @callback
    def async_clear_cache(self, user_id: Optional[str] = None) -> None:
        """Clear cached data for a user or all users."""
        if user_id:
            self._data_cache.pop(user_id, None)
        else:
            self._data_cache.clear()