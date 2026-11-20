/** View for the app backend's upright, already-tinted PNG preview. */
export function mountRegionPanel(container) {
  const heading = document.createElement("h2");
  heading.textContent = "Suspected edit regions";
  const explanation = document.createElement("p");
  explanation.textContent = "Highlights mark areas to review. The model can miss edits or highlight original content.";
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  const figure = document.createElement("div");
  container.replaceChildren(heading, explanation, message, figure);
  let version = 0;
  let previewUrl;

  function clear() {
    figure.replaceChildren();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
  }

  function begin() {
    const current = ++version;
    clear();
    message.textContent = "Checking this image…";
    return async function finish(status, reason, overlayPng) {
      if (current !== version) return;
      clear();
      if (status === "uncertain") {
        message.textContent = reason === "no_candidate_region"
          ? "The model found no region to highlight."
          : "The model could not identify a region reliably.";
        return;
      }
      message.textContent = "Localization unavailable for this image.";
      if (status !== "available" || !(overlayPng instanceof Blob) || overlayPng.type !== "image/png") return;
      const url = URL.createObjectURL(overlayPng);
      previewUrl = url;
      const image = document.createElement("img");
      image.alt = "Uploaded image with suspected edit regions highlighted in orange";
      image.style.maxWidth = "100%";
      image.src = url;
      try {
        await image.decode();
      } catch {
        if (previewUrl === url) clear();
        return;
      }
      if (current === version && previewUrl === url) {
        figure.replaceChildren(image);
        message.textContent = "Orange marks the areas flagged for review.";
      }
    };
  }

  return { begin, reset() { ++version; clear(); message.textContent = ""; } };
}
