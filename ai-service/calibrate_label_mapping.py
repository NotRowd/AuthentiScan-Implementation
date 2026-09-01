"""Determine the model's sigmoid-label mapping using labelled test images."""

from __future__ import annotations

import argparse
from pathlib import Path
from statistics import mean

from model_service import load_authentiscan_model, preprocess_image

SUPPORTED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def image_files(directory: Path) -> list[Path]:
    return sorted(
        path for path in directory.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES
    )


def scores_for(model, directory: Path) -> list[float]:
    scores: list[float] = []
    for image_path in image_files(directory):
        image_array, _ = preprocess_image(image_path.read_bytes())
        scores.append(float(model.predict(image_array, verbose=0)[0][0]))
    return scores


def mapping_from_means(authentic_mean: float, generated_mean: float) -> str:
    """Return the class represented by a higher raw sigmoid score."""
    return "ai_generated" if generated_mean > authentic_mean else "authentic"


def accuracy_for_mapping(
    authentic_scores: list[float], ai_generated_scores: list[float], positive_label: str
) -> float:
    correct = 0
    for score in authentic_scores:
        predicted = positive_label if score >= 0.5 else (
            "ai_generated" if positive_label == "authentic" else "authentic"
        )
        correct += predicted == "authentic"
    for score in ai_generated_scores:
        predicted = positive_label if score >= 0.5 else (
            "ai_generated" if positive_label == "authentic" else "authentic"
        )
        correct += predicted == "ai_generated"
    return correct / (len(authentic_scores) + len(ai_generated_scores))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--authentic-dir", type=Path, required=True)
    parser.add_argument("--ai-generated-dir", type=Path, required=True)
    args = parser.parse_args()

    for directory in (args.authentic_dir, args.ai_generated_dir):
        if not directory.is_dir():
            raise SystemExit(f"Directory does not exist: {directory}")

    model = load_authentiscan_model()
    authentic_scores = scores_for(model, args.authentic_dir)
    generated_scores = scores_for(model, args.ai_generated_dir)
    if not authentic_scores or not generated_scores:
        raise SystemExit("Each directory needs at least one JPG, JPEG, PNG, or WebP image.")

    authentic_mean = mean(authentic_scores)
    generated_mean = mean(generated_scores)
    recommended = mapping_from_means(authentic_mean, generated_mean)
    ai_positive_accuracy = accuracy_for_mapping(authentic_scores, generated_scores, "ai_generated")
    authentic_positive_accuracy = accuracy_for_mapping(authentic_scores, generated_scores, "authentic")

    print("Calibration results (raw model score range: 0 to 1)")
    print(f"Known authentic images: {len(authentic_scores)}, mean score: {authentic_mean:.4f}")
    print(f"Known AI-generated images: {len(generated_scores)}, mean score: {generated_mean:.4f}")
    print(f"Accuracy if 1 = ai_generated: {ai_positive_accuracy:.1%}")
    print(f"Accuracy if 1 = authentic: {authentic_positive_accuracy:.1%}")
    print(f"Suggested AI_POSITIVE_LABEL: {recommended}")

    if min(len(authentic_scores), len(generated_scores)) < 10:
        print("WARNING: Use at least 10 independently sourced images per class before trusting this result.")
    if max(ai_positive_accuracy, authentic_positive_accuracy) < 0.80:
        print("WARNING: The model does not separate this labelled test set reliably; do not integrate it yet.")


if __name__ == "__main__":
    main()
