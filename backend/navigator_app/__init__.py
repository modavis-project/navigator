"""MODAVIS Navigator public application."""
from .config import load_settings
from .public_app import create_public_app

__version__ = "1.0.0"

def create_app():
    settings = load_settings()
    if settings.data_profile != "pod-1.5-public":
        raise ValueError("Navigator requires the POD public database profile")
    return create_public_app(settings)
