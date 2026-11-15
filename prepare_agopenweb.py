"""Set up an isolated AgOpenWeb profile for the FarmOS demo."""

import argparse
import json
from pathlib import Path
from shutil import copytree


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("data", type=Path, help="Dedicated FarmOS demo data directory")
args = parser.parse_args()
root = args.data.resolve() / "AgOpenWeb"
root.mkdir(parents=True, exist_ok=True)

settings_path = root / "appsettings.json"
settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
settings.update(simulatorEnabled=False, imageryVisible=False, ntripEnabled=False)
settings_path.write_text(json.dumps(settings, indent=2) + "\n")

state_path = root / "appstate.json"
if not state_path.exists():
    state = {
        "webCameraPitch": 0, "webCameraZoom": 0.7, "webCameraMode": 1,
        "simulatorLatitude": 32.45132, "simulatorLongitude": -111.24680675
    }
    state_path.write_text(json.dumps(state, indent=2) + "\n")

source = Path(__file__).resolve().parent / "agopenweb" / "Sonoran Fleet Plot"
target = root / "Fields" / source.name
if not target.exists():
    copytree(source, target)
print(f"AgOpenWeb demo data: {args.data.resolve()}")
