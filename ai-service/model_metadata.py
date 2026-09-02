"""Load and validate the portable AuthentiScan model contract.

The model file and this metadata file travel together when a newly trained model
is handed from a training machine to the AI service.  This prevents silently
using the wrong class mapping, image size, or Grad-CAM layer names.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


MODEL_DIRECTORY = Path(__file__).parent / "model"
DEFAULT_METADATA_PATH = MODEL_DIRECTORY / "model-metadata.json"


@dataclass(frozen=True)
class GradCamMetadata:
    base_model_layer: str
    last_conv_layer: str
    pooling_layer: str
    dropout_layer: str
    output_layer: str


@dataclass(frozen=True)
class ModelMetadata:
    model_version: str
    model_file: str
    architecture: str
    input_size: tuple[int, int]
    color_mode: str
    class_indices: dict[str, int]
    positive_class: str
    gradcam: GradCamMetadata
    training_status: str

    @property
    def model_path(self) -> Path:
        return MODEL_DIRECTORY / self.model_file

    @property
    def positive_label(self) -> str:
        # The UI and API use project wording, while the training folders use
        # the manuscript wording fake/real.
        return "authentic" if self.positive_class == "real" else "ai_generated"


def _required_string(data: dict[str, Any], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Model metadata requires a non-empty '{key}' value.")
    return value.strip()


def load_model_metadata(path: Path = DEFAULT_METADATA_PATH) -> ModelMetadata:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise FileNotFoundError(f"Model metadata file was not found: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"Model metadata is not valid JSON: {path}") from error

    if not isinstance(raw, dict):
        raise ValueError("Model metadata must be a JSON object.")

    model_file = _required_string(raw, "model_file")
    if Path(model_file).name != model_file or not model_file.endswith(".keras"):
        raise ValueError("'model_file' must be a .keras filename stored in the model folder.")

    input_size = raw.get("input_size")
    if (
        not isinstance(input_size, list)
        or len(input_size) != 2
        or not all(isinstance(value, int) and value > 0 for value in input_size)
    ):
        raise ValueError("'input_size' must contain two positive integers.")

    class_indices = raw.get("class_indices")
    if class_indices != {"fake": 0, "real": 1}:
        raise ValueError("AuthentiScan requires class_indices {'fake': 0, 'real': 1}.")

    positive_class = _required_string(raw, "positive_class")
    if positive_class != "real":
        raise ValueError("AuthentiScan requires 'positive_class' to be 'real'.")

    gradcam_raw = raw.get("gradcam")
    if not isinstance(gradcam_raw, dict):
        raise ValueError("Model metadata requires a 'gradcam' object.")
    gradcam = GradCamMetadata(
        base_model_layer=_required_string(gradcam_raw, "base_model_layer"),
        last_conv_layer=_required_string(gradcam_raw, "last_conv_layer"),
        pooling_layer=_required_string(gradcam_raw, "pooling_layer"),
        dropout_layer=_required_string(gradcam_raw, "dropout_layer"),
        output_layer=_required_string(gradcam_raw, "output_layer"),
    )

    return ModelMetadata(
        model_version=_required_string(raw, "model_version"),
        model_file=model_file,
        architecture=_required_string(raw, "architecture"),
        input_size=(input_size[0], input_size[1]),
        color_mode=_required_string(raw, "color_mode"),
        class_indices=class_indices,
        positive_class=positive_class,
        gradcam=gradcam,
        training_status=_required_string(raw, "training_status"),
    )
