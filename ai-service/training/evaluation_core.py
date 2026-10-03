"""One inference pass; all summaries derive from the same per-image records."""
import math
from pathlib import Path
import numpy as np
from service.preprocessing import load_model_image
from service.policy import classify_authentic_score


def prediction_records(model, directory: Path, batch_size: int, policy=None):
    if batch_size < 1:
        raise ValueError("Batch size must be positive.")
    samples = []
    for folder, expected in (("fake", "ai_generated"), ("real", "authentic")):
        paths = sorted(p for p in (directory / folder).rglob("*")
                       if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
        if not paths:
            raise ValueError(f"Missing or empty class folder: {directory / folder}")
        samples.extend((p, expected) for p in paths)
    records = []
    for start in range(0, len(samples), batch_size):
        batch = samples[start:start+batch_size]
        scores = np.asarray(model.predict(np.stack([load_model_image(p) for p, _ in batch]), verbose=0))
        if scores.shape != (len(batch), 1) or not np.isfinite(scores).all() or np.any((scores < 0) | (scores > 1)):
            raise ValueError("Invalid prediction scores or output shape.")
        for (path, expected), score in zip(batch, scores[:, 0]):
            score = float(score)
            predicted = "authentic" if score >= 0.5 else "ai_generated"
            record = dict(file=path.relative_to(directory).as_posix(), expected=expected,
                          predicted=predicted, authentic_score=score, ai_generated_score=1-score,
                          correct=predicted == expected)
            if policy:
                record["policy_verdict"] = classify_authentic_score(score, policy)["verdict"]
            records.append(record)
    return records


def summarize(records, verdict_key="predicted"):
    if not records:
        raise ValueError("No prediction records.")
    labels = ("ai_generated", "authentic")
    matrix = {label: {guess: 0 for guess in (*labels, "uncertain")} for label in labels}
    for row in records:
        matrix[row["expected"]][row[verdict_key]] += 1
    correct = sum(matrix[c][c] for c in labels)
    uncertain = sum(matrix[c]["uncertain"] for c in labels)
    decided = len(records)-uncertain
    classes = {}
    for label in labels:
        tp = matrix[label][label]
        fp = sum(matrix[c][label] for c in labels if c != label)
        actual = sum(matrix[label].values())
        precision = tp/(tp+fp) if tp+fp else 0
        recall = tp/actual if actual else 0
        classes[label] = dict(precision=precision, recall=recall,
                             f1=2*precision*recall/(precision+recall) if precision+recall else 0)
    return dict(count=len(records), correct_count=correct, uncertain_count=uncertain, matrix=matrix,
                accuracy=correct/len(records), coverage=decided/len(records),
                decided_accuracy=correct/decided if decided else None, per_class=classes)


def binary_metrics(records):
    summary = summarize(records)
    # Pairwise ROC AUC computed from average ranks (including ties), not new inference.
    sorted_rows = sorted(records, key=lambda row: row["authentic_score"])
    positives = sum(row["expected"] == "authentic" for row in records)
    negatives = len(records)-positives
    rank_sum, start = 0.0, 0
    while start < len(sorted_rows):
        end = start+1
        while end < len(sorted_rows) and sorted_rows[end]["authentic_score"] == sorted_rows[start]["authentic_score"]:
            end += 1
        rank_sum += ((start+1+end)/2)*sum(r["expected"] == "authentic" for r in sorted_rows[start:end])
        start = end
    auc = (rank_sum-positives*(positives+1)/2)/(positives*negatives) if positives and negatives else None
    loss = 0.0
    for row in records:
        p = min(max(row["authentic_score"], 1e-7), 1-1e-7)
        loss -= math.log(p if row["expected"] == "authentic" else 1-p)
    return dict(accuracy=summary["accuracy"], auc=auc, loss=loss/len(records),
                precision=summary["per_class"]["authentic"]["precision"],
                recall=summary["per_class"]["authentic"]["recall"])
