"""Panel for AI Configuration Assistant."""
import logging
from pathlib import Path

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PANEL_NAME, PANEL_TITLE, PANEL_ICON

_LOGGER = logging.getLogger(__name__)

async def async_register_panel(hass: HomeAssistant) -> None:
    """Register the AI Config Assistant panel."""
    try:
        # Get the path to the www folder
        integration_dir = Path(__file__).parent
        www_dir = integration_dir / "www"
        
        # First, ensure the www directory exists
        if not www_dir.exists():
            _LOGGER.error("www folder not found at %s - creating it", www_dir)
            www_dir.mkdir(exist_ok=True)
        
        # Register static path for our JavaScript files using async method
        url_path = "/api/hassio/app/ai-config-assistant"
        await hass.http.async_register_static_paths([
            StaticPathConfig(
                url_path,
                str(www_dir),
                False
            )
        ])
        _LOGGER.info("Registered static path: %s -> %s", url_path, www_dir)
        
        # Add the JavaScript URL with strong cache busting
        import time
        import hashlib
        cache_buster = f"{int(time.time())}-{hashlib.md5(str(time.time()).encode()).hexdigest()[:8]}"
        frontend.add_extra_js_url(hass, f"{url_path}/ai-config-panel.js?v={cache_buster}&bust={int(time.time())}")
        
        frontend.async_register_built_in_panel(
            hass,
            component_name="custom",
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            frontend_url_path=PANEL_NAME,
            config={
                "_panel_custom": {
                    "name": "ai-config-panel",
                    "js_url": f"{url_path}/ai-config-panel.js?v={cache_buster}&bust={int(time.time())}",
                    "embed_iframe": False,
                    "trust_external": False,
                }
            },
            require_admin=False,
        )
        
        _LOGGER.info("✓ AI Configuration Assistant panel registered successfully at /%s", PANEL_NAME)
        
    except Exception as err:
        _LOGGER.error("Failed to register panel: %s", err, exc_info=True)