import tensorflow as tf

from model_metadata import load_model_metadata


def main():
    metadata = load_model_metadata()
    if not metadata.model_path.is_file():
        raise FileNotFoundError(f"Model file was not found: {metadata.model_path}")

    model = tf.keras.models.load_model(metadata.model_path, compile=False)

    print(f"Model loaded: {metadata.model_path.name}")
    print(f"Input shape: {model.input_shape}")
    print(f"Output shape: {model.output_shape}")
    print("Top-level layers:")

    for layer in model.layers:
        print(f"- {layer.name}: {layer.__class__.__name__}")


if __name__ == "__main__":
    main()
