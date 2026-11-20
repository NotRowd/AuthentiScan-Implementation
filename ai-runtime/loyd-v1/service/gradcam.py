"""Grad-CAM generation for the manuscript-approved EfficientNet-B0 model."""

from __future__ import annotations

import numpy as np
import tensorflow as tf
from PIL import Image

from service.policy import InferencePolicy


class GradCAMUnavailable(ValueError):
    """A valid prediction need not have a usable positive attribution map."""


def normalize_heatmap(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=np.float32)
    if values.ndim != 2 or not np.isfinite(values).all():
        raise GradCAMUnavailable("nonfinite_attribution")
    positive = np.maximum(values, 0)
    peak = float(positive.max())
    if peak <= 1e-12:
        raise GradCAMUnavailable("no_positive_attribution")
    return positive / peak


def generate_gradcam(
    model: tf.keras.Model, model_input: np.ndarray, policy: InferencePolicy, target: str
) -> np.ndarray:
    """Return a normalized heatmap for authentic or AI-generated evidence."""
    if target not in ("authentic", "ai_generated"):
        raise ValueError("Grad-CAM requires an explicit supported target class.")
    base_model = model.get_layer(policy.gradcam_base_layer)
    grad_model = tf.keras.Model(
        base_model.inputs,
        [base_model.get_layer(policy.gradcam_last_conv_layer).output, base_model.output],
    )
    with tf.GradientTape() as tape:
        conv_outputs, base_output = grad_model(model_input, training=False)
        x = model.get_layer(policy.gradcam_pooling_layer)(base_output)
        x = model.get_layer(policy.gradcam_dropout_layer)(x, training=False)
        authentic_score = model.get_layer(policy.gradcam_output_layer)(x)[:, 0]
        target_score = authentic_score if target == "authentic" else 1.0 - authentic_score
    gradients = tape.gradient(target_score, conv_outputs)
    if gradients is None:
        raise GradCAMUnavailable("missing_gradients")
    pooled_gradients = tf.reduce_mean(gradients, axis=(0, 1, 2))
    heatmap = conv_outputs[0] @ pooled_gradients[..., tf.newaxis]
    heatmap = tf.squeeze(heatmap)
    return normalize_heatmap(heatmap.numpy())


def overlay_heatmap(heatmap: np.ndarray, original_rgb: np.ndarray, alpha: float = 0.40) -> Image.Image:
    """Legacy blue/green/yellow palette; >=2/3 is yellow, not a probability."""
    if not np.isfinite(heatmap).all() or not 0 <= alpha <= 1:
        raise ValueError("Invalid heatmap or blend strength.")
    height, width = original_rgb.shape[:2]
    resized = Image.fromarray(np.uint8(np.clip(heatmap, 0, 1) * 255)).resize(
        (width, height), Image.Resampling.BILINEAR
    )
    values = np.asarray(resized, dtype=np.float32) / 255.0
    heat_colors = np.stack(
        [
            np.clip(3 * values - 1, 0, 1),
            np.clip(3 * values, 0, 1),
            np.clip(1 - 3 * values, 0, 1),
        ],
        axis=-1,
    )
    blended = (1 - alpha) * original_rgb.astype(np.float32) + alpha * (heat_colors * 255)
    return Image.fromarray(np.uint8(np.clip(blended, 0, 255)), mode="RGB")
