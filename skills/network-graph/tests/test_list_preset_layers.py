import json, subprocess, sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def run_script():
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "list_preset_layers.py")],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout.strip()


def test_returns_all_layers():
    code, out = run_script()
    assert code == 0
    result = json.loads(out)
    assert result["ok"] is True
    assert result["total"] > 0
    layers = result["layers"]
    assert "Conv2d" in layers
    assert "BatchNorm2d" in layers
    assert "ReLU" in layers
    assert "LSTM" in layers
    assert "MultiheadAttention" in layers


def test_layer_has_params():
    code, out = run_script()
    result = json.loads(out)
    conv2d = result["layers"]["Conv2d"]
    assert conv2d["category"] == "convolution"
    param_names = [p["name"] for p in conv2d["params"]]
    assert "in_channels" in param_names
    assert "out_channels" in param_names
    assert "kernel_size" in param_names


def test_param_structure():
    code, out = run_script()
    result = json.loads(out)
    in_ch = [p for p in result["layers"]["Conv2d"]["params"] if p["name"] == "in_channels"][0]
    assert in_ch["type"] == "number"
    assert in_ch["required"] is True
    assert in_ch["default"] is None

    ks = [p for p in result["layers"]["Conv2d"]["params"] if p["name"] == "kernel_size"][0]
    assert ks["default"] == 3


def test_activation_has_no_params():
    code, out = run_script()
    result = json.loads(out)
    assert result["layers"]["GELU"]["params"] == []
    assert result["layers"]["Sigmoid"]["params"] == []
