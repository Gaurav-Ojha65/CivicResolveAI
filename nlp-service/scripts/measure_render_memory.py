"""Measure the real Linux Uvicorn process with both saved models in use.

Run from nlp-service with Python 3.12 and installed requirements. This does not
train or change either artifact. The CI runner is not a Render instance, so its
RSS is evidence for a sizing decision, not a hosted deployment test.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:18083"
FICTIONAL_TEXT = (
    "My fictional mortgage account shows an incorrect escrow balance after "
    "several payments, and I need a review of the charges."
)


def memory_mib(pid: int) -> dict[str, float]:
    status = Path(f"/proc/{pid}/status").read_text(encoding="utf-8")
    values = {}
    for line in status.splitlines():
        if line.startswith(("VmRSS:", "VmHWM:")):
            key, value = line.split(":", 1)
            values[key] = round(int(value.strip().split()[0]) / 1024, 1)
    return {"rss_mib": values["VmRSS"], "peak_rss_mib": values["VmHWM"]}


def request(path: str, payload: dict[str, str] | None = None) -> dict:
    body = json.dumps(payload).encode("utf-8") if payload else None
    req = Request(
        URL + path,
        data=body,
        headers={"Content-Type": "application/json"} if body else {},
    )
    with urlopen(req, timeout=60) as response:
        return json.load(response)


def main() -> None:
    if sys.platform != "linux":
        raise SystemExit("This probe reads Linux /proc and must run on Linux.")

    env = os.environ.copy()
    for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        env[key] = "1"

    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "18083"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            if server.poll() is not None:
                raise RuntimeError(f"Uvicorn exited before health check: {server.returncode}")
            try:
                if request("/health").get("model_loaded"):
                    break
            except URLError:
                pass
            time.sleep(0.5)
        else:
            raise RuntimeError("Uvicorn did not load the saved classifier within 90 seconds")

        samples = {"startup": memory_mib(server.pid)}
        baseline = request("/classify", {"text": FICTIONAL_TEXT})
        samples["baseline_classify"] = memory_mib(server.pid)
        comparison = request("/classify/compare", {"text": FICTIONAL_TEXT})
        samples["bilstm_compare"] = memory_mib(server.pid)
        peak = max(sample["peak_rss_mib"] for sample in samples.values())
        print(json.dumps({
            "python": sys.version.split()[0],
            "memory_limit_mib": 512,
            "samples": samples,
            "peak_rss_mib": peak,
            "fits_render_free_memory": peak < 512,
            "baseline_classification_returned": bool(baseline.get("product_category")),
            "bilstm_comparison_returned": "bilstm" in comparison,
        }, indent=2))
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=10)


if __name__ == "__main__":
    main()
