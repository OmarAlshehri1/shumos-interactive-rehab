"""Copy the reviewed rules into a new isolated config directory; local demo services only."""
import json
import pathlib
import shutil
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory(prefix="shumos-youtube-emulator-") as directory:
    work = pathlib.Path(directory)
    shutil.copyfile(root / "database.rules.json", work / "database.rules.json")
    config = json.loads((root / "docs/control-ux/firebase.demo.json").read_text())
    config["database"]["rules"] = "database.rules.json"
    (work / "firebase.json").write_text(json.dumps(config))
    result = subprocess.run(["npx", "firebase-tools", "emulators:start", "--only", "database,auth", "--project", "demo-shumos-unified", "--config", str(work / "firebase.json")], cwd=root)
    raise SystemExit(result.returncode)
