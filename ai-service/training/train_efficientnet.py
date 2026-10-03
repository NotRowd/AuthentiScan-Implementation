"""Train the manuscript-approved AuthentiScan EfficientNet-B0 model.

The dataset must be created by prepare_dataset.py and contain the exact class
folders fake/ and real/. Directory labels are sorted alphabetically, therefore
the sigmoid output uses fake=0 and real=1. This script only trains and exports
a local candidate model; it does not start an API or connect to the backend.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import tensorflow as tf
SERVICE_DIRECTORY = Path(__file__).resolve().parents[1]
if str(SERVICE_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIRECTORY))
from service.preprocessing import load_model_image, PREPROCESSING_VERSION


IMAGE_SIZE = (224, 224)
CLASS_NAMES = ["fake", "real"]
CLASS_INDICES = {"fake": 0, "real": 1}
GRADCAM_LAYERS = {
    "base_model_layer": "efficientnetb0",
    "last_conv_layer": "top_conv",
    "pooling_layer": "global_average_pooling2d",
    "dropout_layer": "dropout",
    "output_layer": "dense",
}


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    tf.keras.utils.set_random_seed(seed)


def load_split(directory: Path, batch_size: int, shuffle: bool, seed: int):
    if not directory.is_dir():
        raise ValueError(f"Dataset split does not exist: {directory}")
    if batch_size < 1:
        raise ValueError("Batch size must be positive.")
    samples = []
    for label in CLASS_NAMES:
        paths = sorted(p for p in (directory / label).rglob("*")
                       if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
        if not paths:
            raise ValueError(f"Missing or empty class folder: {directory / label}")
        samples.extend((p, CLASS_INDICES[label]) for p in paths)
    def generate():
        ordered = list(samples)
        if shuffle:
            random.Random(seed).shuffle(ordered)
        for path, label in ordered:
            yield load_model_image(path), np.asarray([label], dtype=np.float32)
    dataset = tf.data.Dataset.from_generator(generate, output_signature=(
        tf.TensorSpec((*IMAGE_SIZE, 3), tf.float32), tf.TensorSpec((1,), tf.float32)))
    return dataset.batch(batch_size).prefetch(1)


def build_model(dropout_rate: float) -> tuple[tf.keras.Model, tf.keras.Model]:
    augmentation = tf.keras.Sequential(
        [
            tf.keras.layers.RandomFlip("horizontal"),
            tf.keras.layers.RandomRotation(0.05),
            tf.keras.layers.RandomZoom(0.10),
            tf.keras.layers.RandomContrast(0.10),
        ],
        name="data_augmentation",
    )
    base_model = tf.keras.applications.EfficientNetB0(
        include_top=False,
        weights="imagenet",
        input_shape=(*IMAGE_SIZE, 3),
    )
    base_model.trainable = False

    inputs = tf.keras.Input(shape=(*IMAGE_SIZE, 3), name="image")
    x = augmentation(inputs)
    x = base_model(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D(name="global_average_pooling2d")(x)
    x = tf.keras.layers.Dropout(dropout_rate, name="dropout")(x)
    outputs = tf.keras.layers.Dense(1, activation="sigmoid", name="dense")(x)
    return tf.keras.Model(inputs, outputs, name="authentiscan_efficientnet_b0"), base_model


def compile_model(model: tf.keras.Model, learning_rate: float) -> None:
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate),
        loss=tf.keras.losses.BinaryCrossentropy(),
        metrics=[
            tf.keras.metrics.BinaryAccuracy(name="accuracy"),
            tf.keras.metrics.Precision(name="precision"),
            tf.keras.metrics.Recall(name="recall"),
            tf.keras.metrics.AUC(name="auc"),
        ],
    )


def enable_fine_tuning(base_model: tf.keras.Model, fine_tune_layers: int) -> None:
    if fine_tune_layers < 1:
        return
    base_model.trainable = True
    freeze_until = max(0, len(base_model.layers) - fine_tune_layers)
    for layer in base_model.layers[:freeze_until]:
        layer.trainable = False
    # Batch normalization statistics should stay stable for a modest project dataset.
    for layer in base_model.layers:
        if isinstance(layer, tf.keras.layers.BatchNormalization):
            layer.trainable = False


def confusion_matrix(model: tf.keras.Model, test_dataset) -> dict[str, int]:
    actual: list[int] = []
    predicted: list[int] = []
    for images, labels in test_dataset:
        scores = model.predict(images, verbose=0).reshape(-1)
        actual.extend(labels.numpy().astype(int).reshape(-1).tolist())
        predicted.extend((scores >= 0.5).astype(int).tolist())

    return {
        "true_fake": sum(label == 0 and guess == 0 for label, guess in zip(actual, predicted)),
        "false_authentic": sum(label == 0 and guess == 1 for label, guess in zip(actual, predicted)),
        "false_ai_generated": sum(label == 1 and guess == 0 for label, guess in zip(actual, predicted)),
        "true_authentic": sum(label == 1 and guess == 1 for label, guess in zip(actual, predicted)),
    }


def write_model_metadata(
    output: Path,
    model_filename: str,
    model_version: str,
    metrics: dict[str, float],
    matrix: dict[str, int],
    seed: int,
) -> None:
    metadata = {
        "model_version": model_version,
        "model_file": model_filename,
        "architecture": "EfficientNetB0",
        "input_size": list(IMAGE_SIZE),
        "color_mode": "RGB",
        "preprocessing_version": PREPROCESSING_VERSION,
        "class_indices": CLASS_INDICES,
        "positive_class": "real",
        "gradcam": GRADCAM_LAYERS,
        "training_status": "candidate_needs_independent_evaluation",
        "training": {
            "created_at": datetime.now(UTC).isoformat(),
            "seed": seed,
            "test_metrics": metrics,
            "test_confusion_matrix": matrix,
        },
    }
    (output / "model-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model-version", default="authentiscan-efficientnet-b0-v3")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--warmup-epochs", type=int, default=5)
    parser.add_argument("--finetune-epochs", type=int, default=10)
    parser.add_argument("--fine-tune-layers", type=int, default=30)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--fine-tune-learning-rate", type=float, default=1e-5)
    parser.add_argument("--dropout-rate", type=float, default=0.30)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if args.batch_size < 1 or args.warmup_epochs < 0 or args.finetune_epochs < 0:
        raise SystemExit("Batch size and epoch counts must be non-negative; batch size must be at least one.")
    if args.warmup_epochs + args.finetune_epochs < 1:
        raise SystemExit("At least one training epoch is required.")
    if args.output.exists() and any(args.output.iterdir()):
        raise SystemExit(f"Output folder is not empty: {args.output}. Choose a new version folder.")
    args.output.mkdir(parents=True, exist_ok=True)
    set_seed(args.seed)

    train_dataset = load_split(args.dataset / "train", args.batch_size, True, args.seed)
    valid_dataset = load_split(args.dataset / "valid", args.batch_size, False, args.seed)
    test_dataset = load_split(args.dataset / "test", args.batch_size, False, args.seed)

    model, base_model = build_model(args.dropout_rate)
    model_filename = f"{args.model_version}.keras"
    model_path = args.output / model_filename
    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(model_path, monitor="val_loss", save_best_only=True),
        tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True),
    ]

    if args.warmup_epochs:
        print("Phase 1: training the EfficientNet-B0 classification head.")
        compile_model(model, args.learning_rate)
        model.fit(train_dataset, validation_data=valid_dataset, epochs=args.warmup_epochs, callbacks=callbacks)

    if args.finetune_epochs:
        print("Phase 2: fine-tuning the top EfficientNet-B0 layers.")
        enable_fine_tuning(base_model, args.fine_tune_layers)
        compile_model(model, args.fine_tune_learning_rate)
        model.fit(train_dataset, validation_data=valid_dataset, epochs=args.finetune_epochs, callbacks=callbacks)

    # Always score the checkpoint selected by validation loss, never the final epoch by assumption.
    best_model = tf.keras.models.load_model(model_path, compile=False)
    compile_model(best_model, args.fine_tune_learning_rate)
    test_values = best_model.evaluate(test_dataset, return_dict=True, verbose=1)
    matrix = confusion_matrix(best_model, test_dataset)
    metrics = {name: float(value) for name, value in test_values.items()}
    write_model_metadata(args.output, model_filename, args.model_version, metrics, matrix, args.seed)

    print("\nCandidate model training complete.")
    print(f"Model: {model_path}")
    print(f"Metadata: {args.output / 'model-metadata.json'}")
    print(f"Test metrics: {json.dumps(metrics, indent=2)}")
    print(f"Test confusion matrix: {json.dumps(matrix, indent=2)}")


if __name__ == "__main__":
    main()
