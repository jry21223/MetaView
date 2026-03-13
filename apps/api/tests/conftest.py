import os
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
TEST_DB_PATH = Path(__file__).resolve().parent / ".tmp" / "pipeline_runs_test.db"

if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

TEST_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
if TEST_DB_PATH.exists():
    TEST_DB_PATH.unlink()

os.environ["ALGO_VIS_HISTORY_DB_PATH"] = str(TEST_DB_PATH)
