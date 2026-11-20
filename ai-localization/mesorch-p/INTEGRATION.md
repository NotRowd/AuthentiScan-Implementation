# Backend integration for local testing

Start the worker on loopback port 5014. Create an opt-in panel in the test build. Keep the worker independent of the classification process. From the backend, POST the original JPEG, PNG or WebP file bytes to `/localize` with a Content-Length and the header `X-AuthentiScan-Localizer: localization-v1`. The service accepts single-frame uploads up to 10 MiB and 16 million decoded pixels. One request runs at a time. A busy worker returns 503. Invalid files return 400, and invalid length returns 413. Browser-origin requests are refused. Use a 30-second request timeout on the backend and show “Localization unavailable” on failure.

The request pattern follows the handoff snapshot's localizer_service.py. This experimental response uses **mesorch-demo/1** and a full-resolution grayscale PNG. The snapshot's 32×32 list renderer requires a separate test adapter. Keep its production validation and reviewed-model policy intact.

```python
# In the test backend, with try_image.py on its import path:
from try_image import localize, render

result = localize(upload_bytes)  # loopback; checks input SHA-256
if result["status"] == "available":
    preview_image, binary_mask = render(upload_bytes, result)  # PIL images
    # Encode preview_image as PNG in memory and return it to the opt-in panel.
else:
    # Clear any previous overlay and show "Inconclusive" for this upload.
    reason = result["reason"]
```

Successful replies contain `{"success": true, "data": {...}}`. In data, `status` is available or uncertain. An available result contains `mask_png_base64`, `image_width`, `image_height`, `input_sha256`, model version, threshold and highlighted fraction. The mask uses 255 for flagged pixels and 0 for other pixels. It matches the EXIF-upright image with alpha composited on white. The detector resizes that image to 512×512, restores the sigmoid map to the upright dimensions with bilinear interpolation and applies the fixed 0.5 threshold. The renderer tints only mask pixels. It takes a single image and never uses a reference mask or classifier verdict.

Map `no_candidate_region`, `diffuse_response`, `constant_input` and `invalid_scores` to an inconclusive state with an empty overlay. On timeout, rejection, worker shutdown or malformed reply, clear stale overlays. Use the neutral panel title and plain-language limitation below. Avoid any “authentic” conclusion from these states. Test portrait uploads and EXIF rotation in the actual browser renderer before a live presentation.


## Panel for the capstone app

Import mountRegionPanel from region-panel.mjs into the frontend. Mount once on a dedicated empty container. The panel title is **Suspected edit regions**. It explains that the model can miss edits or highlight original content. Keep the measured development results available in the evaluation documentation.

Call panel.begin() as soon as an upload changes, before awaiting the backend. It clears the prior overlay and gives this upload its own completion callback. Use the backend render() example above to produce a tinted, upright PNG for an available prediction. The callback expects a Blob containing this image. A raw binary mask alone cannot provide the original-image background.

```js
import { mountRegionPanel } from "./region-panel.mjs";
const panel = mountRegionPanel(document.querySelector("#regions"));

// In the app's existing upload handler:
const finish = panel.begin();
try {
  // Implement this app-specific backend bridge using the Python example above.
  // It returns {status, reason, overlayPng}; overlayPng is a PNG Blob when available.
  const { status, reason, overlayPng } = await requestRegionsForUpload(file);
  await finish(status, reason, overlayPng);
} catch {
  await finish("unavailable");
}
// On upload removal or when leaving the view, call panel.reset().
```

The backend validation status is still development_gates_failed. The team must connect and test the upload handler in its own app checkout.
