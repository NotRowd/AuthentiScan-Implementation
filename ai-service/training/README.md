# AuthentiScan dataset preparation and local training

This is the first part of the AI foundation. It prepares data and trains the
manuscript-approved EfficientNet-B0 binary classifier. It does not start an API
or connect an AI model to the backend or web.

## Source folders

Prepare two source folders outside Git, containing images with verified labels:

```text
D:\AuthentiScan-Training\source\real
D:\AuthentiScan-Training\source\fake
```

Do not mix labels. Do not put the same image in both folders. Keep the final
independent evaluation images in a separate location.

## Prepare a pilot dataset

Run this from `D:\AuthentiScan-AI-Foundation\ai-service`. Create a local
Python environment once, then install the training requirements:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-training.txt

.\.venv\Scripts\python.exe .\training\prepare_dataset.py `
  --real-source "D:\AuthentiScan-Training\source\real" `
  --fake-source "D:\AuthentiScan-Training\source\fake" `
  --output "D:\AuthentiScan-Training\datasets\pilot-v1" `
  --limit-per-class 100 `
  --seed 42
```

The command creates balanced `train`, `valid`, and `test` folders plus a
`dataset-manifest.json` showing exact counts, source hashes, ratios, and seed.
It refuses to overwrite an existing dataset.

For final training, remove `--limit-per-class` or set it to a larger balanced
number only after the pilot workflow succeeds.

## Train a local pilot model

After a pilot dataset is prepared, run a short two-phase training check:

```powershell
.\.venv\Scripts\python.exe .\training\train_efficientnet.py `
  --dataset "D:\AuthentiScan-Training\datasets\pilot-v1" `
  --output "D:\AuthentiScan-Training\models\pilot-v3" `
  --warmup-epochs 2 `
  --finetune-epochs 2 `
  --batch-size 8 `
  --seed 42
```

The script uses the fixed `fake = 0`, `real = 1` mapping. It exports a local
`.keras` candidate, `model-metadata.json`, test metrics, and a confusion
matrix. A pilot result proves the workflow only; it is not a final accuracy
claim.

## Evaluate a saved candidate without retraining

If training is interrupted after the model checkpoint is saved, evaluate that
saved file separately instead of repeating the training run:

```powershell
.\.venv\Scripts\python.exe .\training\evaluate_efficientnet.py `
  --dataset "D:\AuthentiScan-Training\datasets\pilot-v1" `
  --model "D:\AuthentiScan-Training\models\pilot-v3\authentiscan-efficientnet-b0-v3.keras" `
  --report "D:\AuthentiScan-Training\models\pilot-v3\candidate-evaluation.json" `
  --batch-size 8 `
  --seed 42
```

## Calibrate the decision policy

After training, use only the `valid` split to select a binary threshold and
review uncertainty-band trade-offs. This preserves the `test` split for a
separate final evaluation. The report presents several uncertainty margins;
choose one deliberately rather than treating `0.50` or `0.05` as a universal
rule.

```powershell
.\.venv\Scripts\python.exe .\training\calibrate_policy.py `
  --dataset "D:\AuthentiScan-Training\datasets\pilot-v2" `
  --model "D:\AuthentiScan-Training\models\pilot-v3\authentiscan-efficientnet-b0-v3.keras" `
  --report "D:\AuthentiScan-Training\models\pilot-v3\pilot-v3-calibration.json" `
  --batch-size 8 `
  --seed 42
```

## Local API foundation

The `service/` folder is an isolated FastAPI wrapper for a calibrated candidate.
It is intentionally not connected to the AuthentiScan backend or web. Before
starting it, copy `service/policy.example.json` outside Git, set its threshold
and uncertainty margin from the calibration report, then set
`AUTHENTISCAN_MODEL_PATH` and `AUTHENTISCAN_POLICY_PATH` for that local model.
