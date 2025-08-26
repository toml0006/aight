"""Entity manager for AI Configuration Assistant."""
import logging
from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass
import json
import re
from collections import defaultdict

from homeassistant.core import HomeAssistant, Event, callback
from homeassistant.helpers.entity_registry import async_get as async_get_entity_registry
from homeassistant.helpers.device_registry import async_get as async_get_device_registry
from homeassistant.helpers.area_registry import async_get as async_get_area_registry
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.util import dt as dt_util

from .const import EXCLUDED_DOMAINS, PREFERRED_DOMAINS

_LOGGER = logging.getLogger(__name__)

@dataclass
class EntityInfo:
    """Information about a Home Assistant entity."""
    entity_id: str
    name: str
    domain: str
    state: str
    attributes: Dict[str, Any]
    area_id: Optional[str] = None
    area_name: Optional[str] = None
    device_name: Optional[str] = None
    last_changed: Optional[str] = None
    last_updated: Optional[str] = None

@dataclass
class EntitySuggestion:
    """Entity suggestion for autocompletion."""
    entity_id: str
    name: str
    domain: str
    score: float
    context: str

@dataclass
class PreviewResult:
    """Result of configuration preview."""
    preview_html: str
    entities_referenced: List[str]
    warnings: List[str]
    errors: List[str]

class EntityManager:
    """Manage entities and provide autocomplete functionality."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the entity manager."""
        self.hass = hass
        self._entities_cache: Dict[str, EntityInfo] = {}
        self._entities_by_domain: Dict[str, List[str]] = defaultdict(list)
        self._entities_by_area: Dict[str, List[str]] = defaultdict(list)
        self._search_index: Dict[str, Set[str]] = defaultdict(set)
        self._last_update = None
        
        # Register for state changes
        self.hass.bus.async_listen("state_changed", self._handle_state_changed)

    async def initialize(self) -> None:
        """Initialize the entity manager."""
        await self._build_entity_cache()
        _LOGGER.info("Entity manager initialized with %d entities", len(self._entities_cache))

    async def _build_entity_cache(self) -> None:
        """Build the entity cache from Home Assistant state."""
        entity_registry = async_get_entity_registry(self.hass)
        device_registry = async_get_device_registry(self.hass)
        area_registry = async_get_area_registry(self.hass)
        
        # Clear existing cache
        self._entities_cache.clear()
        self._entities_by_domain.clear()
        self._entities_by_area.clear()
        self._search_index.clear()

        # Process all entities
        all_states = self.hass.states.async_all()
        _LOGGER.info("Total states in Home Assistant: %d", len(all_states))
        
        # Log all light entities found
        light_entities = [s.entity_id for s in all_states if s.entity_id.startswith('light.')]
        _LOGGER.info("Light entities found in states: %s", light_entities)
        
        for state in all_states:
            entity_id = state.entity_id
            domain = entity_id.split('.')[0]
            
            # Skip excluded domains
            if domain in EXCLUDED_DOMAINS:
                continue
            
            # Get entity registry entry
            entity_entry = entity_registry.entities.get(entity_id)
            area_id = None
            area_name = None
            device_name = None

            if entity_entry:
                # Get area information
                if entity_entry.area_id:
                    area_id = entity_entry.area_id
                    area = area_registry.areas.get(area_id)
                    area_name = area.name if area else None
                elif entity_entry.device_id:
                    # Try to get area from device
                    device = device_registry.devices.get(entity_entry.device_id)
                    if device and device.area_id:
                        area_id = device.area_id
                        area = area_registry.areas.get(area_id)
                        area_name = area.name if area else None
                    if device:
                        device_name = device.name_by_user or device.name

            # Create entity info
            entity_info = EntityInfo(
                entity_id=entity_id,
                name=state.name or entity_id,
                domain=domain,
                state=state.state,
                attributes=dict(state.attributes),
                area_id=area_id,
                area_name=area_name,
                device_name=device_name,
                last_changed=state.last_changed.isoformat() if state.last_changed else None,
                last_updated=state.last_updated.isoformat() if state.last_updated else None,
            )

            # Add to cache
            self._entities_cache[entity_id] = entity_info
            self._entities_by_domain[domain].append(entity_id)
            
            if area_id:
                self._entities_by_area[area_id].append(entity_id)

            # Build search index
            self._add_to_search_index(entity_info)

        self._last_update = dt_util.utcnow()

    def _add_to_search_index(self, entity_info: EntityInfo) -> None:
        """Add entity to search index."""
        # Index by entity_id parts
        parts = entity_info.entity_id.replace('_', ' ').split('.')
        for part in parts:
            self._search_index[part.lower()].add(entity_info.entity_id)
        
        # Index by name parts
        name_parts = entity_info.name.lower().replace('_', ' ').split()
        for part in name_parts:
            self._search_index[part].add(entity_info.entity_id)
        
        # Index by domain
        self._search_index[entity_info.domain].add(entity_info.entity_id)
        
        # Index by area
        if entity_info.area_name:
            area_parts = entity_info.area_name.lower().replace('_', ' ').split()
            for part in area_parts:
                self._search_index[part].add(entity_info.entity_id)

    @callback
    def _handle_state_changed(self, event: Event) -> None:
        """Handle state changed events."""
        entity_id = event.data.get("entity_id")
        new_state = event.data.get("new_state")
        
        if entity_id in self._entities_cache and new_state:
            # Update cached entity info
            self._entities_cache[entity_id].state = new_state.state
            self._entities_cache[entity_id].attributes = dict(new_state.attributes)
            self._entities_cache[entity_id].last_changed = (
                new_state.last_changed.isoformat() if new_state.last_changed else None
            )
            self._entities_cache[entity_id].last_updated = (
                new_state.last_updated.isoformat() if new_state.last_updated else None
            )

    async def get_entity_suggestions(
        self, 
        query: str, 
        domain_filter: Optional[List[str]] = None,
        limit: int = 10
    ) -> List[EntitySuggestion]:
        """Get entity suggestions for autocompletion."""
        if not query:
            # Return preferred entities when no query
            suggestions = []
            for domain in PREFERRED_DOMAINS:
                entities = self._entities_by_domain.get(domain, [])[:2]
                for entity_id in entities:
                    entity_info = self._entities_cache.get(entity_id)
                    if entity_info:
                        suggestions.append(EntitySuggestion(
                            entity_id=entity_id,
                            name=entity_info.name,
                            domain=domain,
                            score=1.0,
                            context=f"{domain} in {entity_info.area_name or 'No Area'}"
                        ))
            return suggestions[:limit]

        query_lower = query.lower()
        scored_results: List[Tuple[str, float]] = []

        # Search through the index
        for term, entity_ids in self._search_index.items():
            if query_lower in term:
                score = self._calculate_match_score(query_lower, term)
                for entity_id in entity_ids:
                    scored_results.append((entity_id, score))

        # Sort by score and remove duplicates
        seen_entities = set()
        unique_results = []
        for entity_id, score in sorted(scored_results, key=lambda x: x[1], reverse=True):
            if entity_id not in seen_entities:
                seen_entities.add(entity_id)
                unique_results.append((entity_id, score))

        # Filter by domain if specified
        if domain_filter:
            unique_results = [
                (entity_id, score) for entity_id, score in unique_results
                if entity_id.split('.')[0] in domain_filter
            ]

        # Convert to suggestions
        suggestions = []
        for entity_id, score in unique_results[:limit]:
            entity_info = self._entities_cache.get(entity_id)
            if entity_info:
                context = f"{entity_info.domain}"
                if entity_info.area_name:
                    context += f" in {entity_info.area_name}"
                if entity_info.device_name:
                    context += f" ({entity_info.device_name})"

                suggestions.append(EntitySuggestion(
                    entity_id=entity_id,
                    name=entity_info.name,
                    domain=entity_info.domain,
                    score=score,
                    context=context
                ))

        return suggestions

    def _calculate_match_score(self, query: str, term: str) -> float:
        """Calculate match score for search results."""
        if query == term:
            return 1.0
        if query in term:
            return 0.8 - (len(term) - len(query)) * 0.1
        if term.startswith(query):
            return 0.7
        return 0.5

    async def get_entities_by_area(self, area_name: str) -> List[EntityInfo]:
        """Get all entities in a specific area."""
        area_registry = async_get_area_registry(self.hass)
        area = next(
            (area for area in area_registry.areas.values() 
             if area.name.lower() == area_name.lower()),
            None
        )
        
        if not area:
            return []
        
        entity_ids = self._entities_by_area.get(area.id, [])
        return [self._entities_cache[eid] for eid in entity_ids if eid in self._entities_cache]

    async def get_entities_by_domain(self, domain: str) -> List[EntityInfo]:
        """Get all entities in a specific domain."""
        entity_ids = self._entities_by_domain.get(domain, [])
        return [self._entities_cache[eid] for eid in entity_ids if eid in self._entities_cache]

    def get_all_entities(self) -> Dict[str, EntityInfo]:
        """Get all entities with their current states."""
        return self._entities_cache.copy()
    
    def get_all_areas(self) -> List[str]:
        """Get all area names in the system."""
        area_registry = async_get_area_registry(self.hass)
        return [area.name for area in area_registry.areas.values()]
    
    async def get_entity_context(self, entity_ids: List[str]) -> Dict[str, Any]:
        """Get context information for a list of entities."""
        _LOGGER.info("Getting context for %d entity IDs", len(entity_ids))
        _LOGGER.info("Entity IDs requested: %s", entity_ids[:10] if entity_ids else [])
        _LOGGER.info("Entities in cache: %d", len(self._entities_cache))
        _LOGGER.info("Sample cache keys: %s", list(self._entities_cache.keys())[:10])
        
        # Refresh cache if needed to ensure we have current entities
        if len(entity_ids) > 0:
            # Check if any requested entities are missing from cache
            missing_entities = [eid for eid in entity_ids if eid not in self._entities_cache]
            if missing_entities:
                _LOGGER.info("Missing entities detected, refreshing cache. Missing: %s", missing_entities[:5])
                await self._build_entity_cache()
        
        context = {
            "entities": {},
            "areas": set(),
            "domains": set(),
            "current_states": {},
        }

        for entity_id in entity_ids:
            # Try cache first
            entity_info = self._entities_cache.get(entity_id)
            
            # If not in cache, try to get directly from Home Assistant state
            if not entity_info:
                state = self.hass.states.get(entity_id)
                if state:
                    _LOGGER.info("Entity %s not in cache but found in states, adding it", entity_id)
                    # Create a basic entity info from state
                    entity_info = EntityInfo(
                        entity_id=entity_id,
                        name=state.attributes.get("friendly_name", entity_id),
                        domain=entity_id.split('.')[0],
                        state=state.state,
                        attributes=dict(state.attributes),
                        area_id=None,
                        area_name=None,
                        device_name=None,
                        last_changed=state.last_changed.isoformat() if state.last_changed else None,
                        last_updated=state.last_updated.isoformat() if state.last_updated else None,
                    )
                    # Add to cache for future use
                    self._entities_cache[entity_id] = entity_info
            
            if entity_info:
                context["entities"][entity_id] = {
                    "name": entity_info.name,
                    "domain": entity_info.domain,
                    "area": entity_info.area_name,
                    "device": entity_info.device_name,
                }
                
                if entity_info.area_name:
                    context["areas"].add(entity_info.area_name)
                
                context["domains"].add(entity_info.domain)
                context["current_states"][entity_id] = {
                    "state": entity_info.state,
                    "attributes": entity_info.attributes,
                }
            else:
                _LOGGER.warning("Entity ID '%s' not found in cache!", entity_id)

        # Convert sets to lists for JSON serialization
        context["areas"] = list(context["areas"])
        context["domains"] = list(context["domains"])
        
        return context

    async def preview_config(
        self, 
        config_yaml: str, 
        config_type: str
    ) -> PreviewResult:
        """Preview a configuration with live entity data."""
        try:
            import yaml
            
            # Parse the YAML
            try:
                config = yaml.safe_load(config_yaml)
            except yaml.YAMLError as err:
                return PreviewResult(
                    preview_html=f"<div class='error'>YAML Parse Error: {err}</div>",
                    entities_referenced=[],
                    warnings=[],
                    errors=[f"Invalid YAML: {err}"]
                )

            # Extract entity references
            entities_referenced = self._extract_entity_references(config_yaml)
            
            # Generate preview HTML
            preview_html = self._generate_preview_html(config, config_type, entities_referenced)
            
            # Check for warnings
            warnings = []
            for entity_id in entities_referenced:
                if entity_id not in self._entities_cache:
                    warnings.append(f"Entity '{entity_id}' not found")
                else:
                    entity_info = self._entities_cache[entity_id]
                    if entity_info.state in [STATE_UNAVAILABLE, STATE_UNKNOWN]:
                        warnings.append(f"Entity '{entity_id}' is {entity_info.state}")

            return PreviewResult(
                preview_html=preview_html,
                entities_referenced=entities_referenced,
                warnings=warnings,
                errors=[]
            )

        except Exception as err:
            _LOGGER.error("Error previewing config: %s", err)
            return PreviewResult(
                preview_html=f"<div class='error'>Preview Error: {err}</div>",
                entities_referenced=[],
                warnings=[],
                errors=[str(err)]
            )

    def _extract_entity_references(self, config_text: str) -> List[str]:
        """Extract entity IDs from configuration text."""
        # Regex pattern to match entity IDs
        entity_pattern = r'\b[a-zA-Z_]+\.[a-zA-Z0-9_]+\b'
        matches = re.findall(entity_pattern, config_text)
        
        # Filter to only valid entity IDs that exist
        entity_ids = []
        for match in matches:
            if '.' in match and match in self._entities_cache:
                entity_ids.append(match)
        
        return list(set(entity_ids))  # Remove duplicates

    def _generate_preview_html(
        self, 
        config: Any, 
        config_type: str, 
        entities_referenced: List[str]
    ) -> str:
        """Generate HTML preview of the configuration."""
        html_parts = [
            "<div class='config-preview'>",
            f"<h3>{config_type.title()} Preview</h3>"
        ]

        if config_type == "automation":
            html_parts.extend(self._preview_automation(config))
        elif config_type == "script":
            html_parts.extend(self._preview_script(config))
        elif config_type == "dashboard":
            html_parts.extend(self._preview_dashboard(config))
        else:
            html_parts.append("<div class='info'>Preview not available for this configuration type</div>")

        # Add entity states
        if entities_referenced:
            html_parts.append("<h4>Referenced Entities</h4>")
            html_parts.append("<div class='entity-states'>")
            for entity_id in entities_referenced:
                entity_info = self._entities_cache.get(entity_id)
                if entity_info:
                    state_class = "available" if entity_info.state not in [STATE_UNAVAILABLE, STATE_UNKNOWN] else "unavailable"
                    html_parts.append(
                        f"<div class='entity-state {state_class}'>"
                        f"<strong>{entity_info.name}</strong> ({entity_id}): {entity_info.state}"
                        f"</div>"
                    )
            html_parts.append("</div>")

        html_parts.append("</div>")
        return "".join(html_parts)

    def _preview_automation(self, config: Dict[str, Any]) -> List[str]:
        """Preview automation configuration."""
        html_parts = []
        
        if "alias" in config:
            html_parts.append(f"<h4>{config['alias']}</h4>")
        
        # Trigger section
        if "trigger" in config:
            html_parts.append("<h5>Triggers:</h5><ul>")
            triggers = config["trigger"] if isinstance(config["trigger"], list) else [config["trigger"]]
            for trigger in triggers:
                trigger_desc = self._describe_trigger(trigger)
                html_parts.append(f"<li>{trigger_desc}</li>")
            html_parts.append("</ul>")

        # Condition section
        if "condition" in config:
            html_parts.append("<h5>Conditions:</h5><ul>")
            conditions = config["condition"] if isinstance(config["condition"], list) else [config["condition"]]
            for condition in conditions:
                condition_desc = self._describe_condition(condition)
                html_parts.append(f"<li>{condition_desc}</li>")
            html_parts.append("</ul>")

        # Action section
        if "action" in config:
            html_parts.append("<h5>Actions:</h5><ul>")
            actions = config["action"] if isinstance(config["action"], list) else [config["action"]]
            for action in actions:
                action_desc = self._describe_action(action)
                html_parts.append(f"<li>{action_desc}</li>")
            html_parts.append("</ul>")

        return html_parts

    def _preview_script(self, config: Dict[str, Any]) -> List[str]:
        """Preview script configuration."""
        html_parts = []
        
        if "alias" in config:
            html_parts.append(f"<h4>{config['alias']}</h4>")
        
        if "sequence" in config:
            html_parts.append("<h5>Sequence:</h5><ol>")
            for step in config["sequence"]:
                step_desc = self._describe_action(step)
                html_parts.append(f"<li>{step_desc}</li>")
            html_parts.append("</ol>")

        return html_parts

    def _preview_dashboard(self, config: Dict[str, Any]) -> List[str]:
        """Preview dashboard configuration."""
        return ["<div class='info'>Dashboard preview shows the basic structure</div>"]

    def _describe_trigger(self, trigger: Dict[str, Any]) -> str:
        """Describe an automation trigger."""
        trigger_type = trigger.get("platform", "unknown")
        if trigger_type == "state":
            entity_id = trigger.get("entity_id", "")
            return f"State change of {entity_id}"
        elif trigger_type == "time":
            at_time = trigger.get("at", "")
            return f"Time trigger at {at_time}"
        else:
            return f"{trigger_type.title()} trigger"

    def _describe_condition(self, condition: Dict[str, Any]) -> str:
        """Describe an automation condition."""
        condition_type = condition.get("condition", "unknown")
        if condition_type == "state":
            entity_id = condition.get("entity_id", "")
            state = condition.get("state", "")
            return f"{entity_id} is {state}"
        else:
            return f"{condition_type.title()} condition"

    def _describe_action(self, action: Dict[str, Any]) -> str:
        """Describe an automation action."""
        if "service" in action:
            service = action["service"]
            target = action.get("target", {})
            if "entity_id" in target:
                return f"Call {service} on {target['entity_id']}"
            else:
                return f"Call service {service}"
        elif "delay" in action:
            return f"Wait {action['delay']}"
        else:
            return "Unknown action"

    def get_all_areas(self) -> List[str]:
        """Get a list of all area names."""
        area_registry = async_get_area_registry(self.hass)
        return [area.name for area in area_registry.areas.values()]

    def get_all_entities(self) -> Dict[str, EntityInfo]:
        """Get all cached entities."""
        return self._entities_cache

    async def refresh_entities(self) -> None:
        """Refresh the entity cache."""
        await self._build_entity_cache()

    @property
    def entity_count(self) -> int:
        """Get the number of cached entities."""
        return len(self._entities_cache)

    @property
    def last_update(self):
        """Get the timestamp of the last update."""
        return self._last_update