from pathlib import Path

import tensorflow as tf


MODEL_PATH = Path(__file__).parent / "model" / "authentiscan_efficientnet_b0_v2.keras"


def main():
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Model file was not found: {MODEL_PATH}")

    model = tf.keras.models.load_model(MODEL_PATH, compile=False)

    print(f"Model loaded: {MODEL_PATH.name}")
    print(f"Input shape: {model.input_shape}")
    print(f"Output shape: {model.output_shape}")
    print("Top-level layers:")

    for layer in model.layers:
        print(f"- {layer.name}: {layer.__class__.__name__}")


if __name__ == "__main__":
    main()
