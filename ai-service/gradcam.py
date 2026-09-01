
import numpy as np
import tensorflow as tf
import cv2

def generate_gradcam(model, img_array, last_conv_layer_name='top_conv'):
    """
    Generates a Grad-CAM heatmap for a given preprocessed image array.
    model: the loaded AuthentiScan Keras model
    img_array: preprocessed image, shape (1, 224, 224, 3)
    Returns: heatmap as a numpy array (7x7, values 0-1)
    """
    base_model = model.get_layer('efficientnetb0')

    grad_model = tf.keras.models.Model(
        base_model.inputs,
        [base_model.get_layer(last_conv_layer_name).output, base_model.output],
    )

    with tf.GradientTape() as tape:
        conv_outputs, base_output = grad_model([img_array])
        x = model.get_layer('global_average_pooling2d')(base_output)
        x = model.get_layer('dropout')(x)
        predictions = model.get_layer('dense')(x)
        loss = predictions[:, 0]

    grads = tape.gradient(loss, conv_outputs)
    pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))

    conv_outputs = conv_outputs[0]
    heatmap = conv_outputs @ pooled_grads[..., tf.newaxis]
    heatmap = tf.squeeze(heatmap)
    heatmap = tf.maximum(heatmap, 0) / (tf.math.reduce_max(heatmap) + 1e-8)
    return heatmap.numpy()

def overlay_heatmap(heatmap, original_img_rgb, alpha=0.4):
    """
    Overlays a Grad-CAM heatmap onto the original image.
    original_img_rgb: numpy array, shape (H, W, 3), RGB, values 0-255
    Returns: overlay image as numpy array (RGB, uint8) ready for saving/encoding
    """
    heatmap_resized = cv2.resize(heatmap, (original_img_rgb.shape[1], original_img_rgb.shape[0]))
    heatmap_uint8 = np.uint8(255 * heatmap_resized)
    heatmap_colored = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
    heatmap_colored = cv2.cvtColor(heatmap_colored, cv2.COLOR_BGR2RGB)  # match RGB input

    superimposed = heatmap_colored * alpha + original_img_rgb
    superimposed = np.clip(superimposed, 0, 255).astype(np.uint8)
    return superimposed
