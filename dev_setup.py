#!/usr/bin/env python3
"""
Development setup utility for Aight - AI Configuration Assistant
Provides automated setup for local Home Assistant development
"""

import os
import sys
import json
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any

class DevSetup:
    """Handle development environment setup"""
    
    def __init__(self):
        self.project_dir = Path.cwd()
        self.config_file = self.project_dir / '.dev_config.json'
        self.config: Dict[str, Any] = {}
        
    def run(self):
        """Main setup flow"""
        print("🚀 Aight Development Setup")
        print("=" * 40)
        print()
        
        # Check prerequisites
        if not self.check_prerequisites():
            return
            
        # Setup method selection
        method = self.select_setup_method()
        
        if method == '1':
            self.setup_symlink()
        elif method == '2':
            self.setup_docker()
        elif method == '3':
            self.setup_devcontainer()
        else:
            print("Invalid selection")
            return
            
        # Save configuration
        self.save_config()
        
        # Create helper scripts
        self.create_helpers()
        
        print("\n✅ Setup complete!")
        self.print_next_steps()
        
    def check_prerequisites(self) -> bool:
        """Check if we're in the right directory"""
        manifest = self.project_dir / 'custom_components' / 'ai_config_assistant' / 'manifest.json'
        if not manifest.exists():
            print("❌ Error: Please run this script from the project root directory")
            print(f"   Looking for: {manifest}")
            return False
            
        # Check if git is initialized
        if not (self.project_dir / '.git').exists():
            print("⚠️  Warning: Git not initialized in this directory")
            
        return True
        
    def select_setup_method(self) -> str:
        """Select development setup method"""
        print("Select your development setup method:\n")
        print("1. Symlink to existing Home Assistant installation")
        print("   Best for: Local HA install, Home Assistant OS with SSH")
        print()
        print("2. Docker Compose development environment")
        print("   Best for: Isolated testing, no existing HA install")
        print()
        print("3. VS Code Dev Container")
        print("   Best for: Full IDE integration, consistent environment")
        print()
        
        return input("Enter selection (1-3): ").strip()
        
    def setup_symlink(self):
        """Setup symlink-based development"""
        print("\n📁 Setting up symlink development...")
        
        # Get HA config directory
        ha_config = self.get_ha_config_dir()
        if not ha_config:
            return
            
        self.config['method'] = 'symlink'
        self.config['ha_config_dir'] = str(ha_config)
        
        # Create symlinks
        self.create_symlinks(ha_config)
        
    def setup_docker(self):
        """Setup Docker-based development"""
        print("\n🐳 Setting up Docker development...")
        
        self.config['method'] = 'docker'
        
        # Check Docker is installed
        if not self.check_docker():
            print("❌ Docker not found. Please install Docker first.")
            print("   Visit: https://docs.docker.com/get-docker/")
            return
            
        # Create dev-config directory
        dev_config_dir = self.project_dir / 'dev-config'
        dev_config_dir.mkdir(exist_ok=True)
        
        # Create basic configuration.yaml
        config_yaml = dev_config_dir / 'configuration.yaml'
        if not config_yaml.exists():
            self.create_basic_config(config_yaml)
            
        print("✓ Docker Compose environment prepared")
        print("\nTo start Home Assistant:")
        print("  docker-compose -f docker-compose.dev.yml up")
        
    def setup_devcontainer(self):
        """Setup VS Code Dev Container"""
        print("\n💻 Setting up Dev Container...")
        
        self.config['method'] = 'devcontainer'
        
        # Create .devcontainer directory
        devcontainer_dir = self.project_dir / '.devcontainer'
        devcontainer_dir.mkdir(exist_ok=True)
        
        # Create devcontainer.json
        self.create_devcontainer_config(devcontainer_dir)
        
        print("✓ Dev Container configuration created")
        print("\nTo use:")
        print("1. Open this folder in VS Code")
        print("2. Install 'Remote - Containers' extension")
        print("3. Click 'Reopen in Container' when prompted")
        
    def get_ha_config_dir(self) -> Optional[Path]:
        """Get Home Assistant configuration directory"""
        print("\nEnter your Home Assistant configuration directory:")
        print("Examples:")
        print("  - Docker: /path/to/homeassistant/config")
        print("  - Local: ~/.homeassistant")
        print("  - Home Assistant OS: /config")
        
        path_str = input("\nPath: ").strip()
        if not path_str:
            return None
            
        # Expand user home
        path_str = os.path.expanduser(path_str)
        ha_path = Path(path_str)
        
        # Verify it exists
        if not ha_path.exists():
            print(f"❌ Directory not found: {ha_path}")
            return None
            
        # Check if it looks like HA config
        if not (ha_path / 'configuration.yaml').exists():
            print(f"⚠️  Warning: configuration.yaml not found in {ha_path}")
            if input("Continue anyway? (y/n): ").lower() != 'y':
                return None
                
        return ha_path
        
    def create_symlinks(self, ha_config: Path):
        """Create symlinks to HA installation"""
        # Custom components
        custom_components = ha_config / 'custom_components'
        custom_components.mkdir(exist_ok=True)
        
        integration_link = custom_components / 'ai_config_assistant'
        if integration_link.exists():
            if integration_link.is_symlink():
                integration_link.unlink()
            else:
                shutil.rmtree(integration_link)
                
        integration_src = self.project_dir / 'custom_components' / 'ai_config_assistant'
        integration_link.symlink_to(integration_src)
        print(f"✓ Linked integration: {integration_link}")
        
        # WWW directory
        www_dir = ha_config / 'www'
        www_dir.mkdir(exist_ok=True)
        
        www_link = www_dir / 'ai-config-assistant'
        if www_link.exists():
            if www_link.is_symlink():
                www_link.unlink()
            else:
                shutil.rmtree(www_link)
                
        www_src = self.project_dir / 'www' / 'ai-config-assistant'
        www_link.symlink_to(www_src)
        print(f"✓ Linked www files: {www_link}")
        
    def check_docker(self) -> bool:
        """Check if Docker is installed"""
        try:
            subprocess.run(['docker', '--version'], 
                         capture_output=True, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
            
    def create_basic_config(self, config_path: Path):
        """Create basic Home Assistant configuration"""
        config = """# Home Assistant Development Configuration

default_config:

# Enable debug logging for the integration
logger:
  default: warning
  logs:
    custom_components.ai_config_assistant: debug

# Frontend configuration
frontend:
  themes: !include_dir_merge_named themes

# HTTP configuration
http:
  # Uncomment to add trusted proxies
  # trusted_proxies:
  #   - 127.0.0.1
  #   - ::1

# Uncomment to use PostgreSQL (if using docker-compose with postgres)
# recorder:
#   db_url: postgresql://homeassistant:homeassistant@postgres/homeassistant
"""
        config_path.write_text(config)
        print(f"✓ Created configuration.yaml")
        
    def create_devcontainer_config(self, devcontainer_dir: Path):
        """Create devcontainer.json configuration"""
        config = {
            "name": "Aight Development",
            "image": "ghcr.io/home-assistant/home-assistant:stable",
            "appPort": ["8123:8123"],
            "mounts": [
                "source=${localWorkspaceFolder}/custom_components/ai_config_assistant,target=/config/custom_components/ai_config_assistant,type=bind",
                "source=${localWorkspaceFolder}/www/ai-config-assistant,target=/config/www/ai-config-assistant,type=bind",
                "source=${localWorkspaceFolder}/dev-config,target=/config,type=bind"
            ],
            "customizations": {
                "vscode": {
                    "extensions": [
                        "ms-python.python",
                        "ms-python.vscode-pylance",
                        "charliermarsh.ruff",
                        "esbenp.prettier-vscode"
                    ],
                    "settings": {
                        "python.linting.enabled": True,
                        "python.linting.pylintEnabled": False,
                        "python.formatting.provider": "black",
                        "editor.formatOnSave": True
                    }
                }
            },
            "postCreateCommand": "pip install -r custom_components/ai_config_assistant/requirements.txt",
            "remoteUser": "root"
        }
        
        config_file = devcontainer_dir / 'devcontainer.json'
        config_file.write_text(json.dumps(config, indent=2))
        print(f"✓ Created devcontainer.json")
        
    def save_config(self):
        """Save development configuration"""
        self.config['project_dir'] = str(self.project_dir)
        self.config_file.write_text(json.dumps(self.config, indent=2))
        print(f"✓ Configuration saved to {self.config_file}")
        
    def create_helpers(self):
        """Create helper scripts based on setup method"""
        if self.config.get('method') == 'symlink':
            self.create_symlink_helpers()
        elif self.config.get('method') == 'docker':
            self.create_docker_helpers()
            
    def create_symlink_helpers(self):
        """Create helper scripts for symlink setup"""
        # Quick test script
        test_script = self.project_dir / 'test_integration.py'
        test_content = '''#!/usr/bin/env python3
"""Quick test script for the integration"""

import asyncio
import json
from pathlib import Path

# Add the custom component to path
import sys
sys.path.insert(0, str(Path(__file__).parent / 'custom_components'))

from ai_config_assistant.llm_client import LLMClient
from ai_config_assistant.config_generator import ConfigGenerator

async def test_generation():
    """Test configuration generation"""
    # This is a basic test - modify as needed
    client = LLMClient(
        provider="openai",
        api_key="your-api-key-here",
        model="gpt-3.5-turbo"
    )
    
    generator = ConfigGenerator(client)
    
    prompt = "Turn on living room lights at sunset"
    config_type = "automation"
    
    try:
        result = await generator.generate(prompt, config_type, {})
        print("Generated configuration:")
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_generation())
'''
        test_script.write_text(test_content)
        test_script.chmod(0o755)
        print("✓ Created test_integration.py")
        
    def create_docker_helpers(self):
        """Create helper scripts for Docker setup"""
        # Docker run script
        run_script = self.project_dir / 'run_docker.sh'
        run_content = '''#!/bin/bash
# Start the Docker development environment

echo "Starting Home Assistant development environment..."
docker-compose -f docker-compose.dev.yml up

# To run in background: docker-compose -f docker-compose.dev.yml up -d
# To stop: docker-compose -f docker-compose.dev.yml down
# To view logs: docker-compose -f docker-compose.dev.yml logs -f
'''
        run_script.write_text(run_content)
        run_script.chmod(0o755)
        print("✓ Created run_docker.sh")
        
    def print_next_steps(self):
        """Print next steps based on setup method"""
        print("\n" + "=" * 40)
        print("Next Steps:")
        print("=" * 40)
        
        if self.config.get('method') == 'symlink':
            print("""
1. Run the setup script:
   chmod +x setup_dev.sh
   ./setup_dev.sh

2. Restart Home Assistant to load the development version

3. Enable debug logging in configuration.yaml:
   logger:
     default: warning
     logs:
       custom_components.ai_config_assistant: debug

4. Make changes and restart HA to test
""")
        elif self.config.get('method') == 'docker':
            print("""
1. Start the Docker environment:
   docker-compose -f docker-compose.dev.yml up

2. Access Home Assistant at http://localhost:8123

3. Complete the onboarding process

4. Add the integration:
   Settings → Devices & Services → Add Integration → Search "Aight"

5. Make changes to code - they're automatically mounted
""")
        elif self.config.get('method') == 'devcontainer':
            print("""
1. Open this folder in VS Code

2. Install the 'Remote - Containers' extension

3. When prompted, click 'Reopen in Container'

4. The container will build and start Home Assistant

5. Access Home Assistant at http://localhost:8123
""")

if __name__ == "__main__":
    setup = DevSetup()
    setup.run()