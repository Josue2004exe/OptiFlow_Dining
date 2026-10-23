import json
from pathlib import Path

LAYOUT_PATH = Path(__file__).resolve().parents[2] / 'config' / 'salon.json'

def get_layout():
    with LAYOUT_PATH.open(encoding='utf-8') as f:
        return json.load(f)
