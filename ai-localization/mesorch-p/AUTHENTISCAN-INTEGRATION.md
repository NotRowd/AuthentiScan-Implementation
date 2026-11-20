# AuthentiScan pixel-localization integration

This package is wired as an optional, separate localization service. It does not change the classifier or Grad-CAM. A saved mask is private to its scan owner, is removed with the scan, and is used for the orange browser and PDF previews.

## Runtime requirements

The handoff ZIP contains source code but not the model checkpoint. The official `mesorch_p-118.pth` checkpoint is 812,736,608 bytes and must have SHA-256 `efa61592f2c783698a8760c2d3e48dc58c1b4890c50dbcdc166b24425a197674`. The service verifies this digest before loading it. The checkpoint's redistribution terms remain unresolved, so this repository does not bundle it.

The local service requires the CUDA runtime used for evaluation, a compatible NVIDIA GPU with at least 4.5 GiB free VRAM, and about 6 GiB free system RAM at startup. Firebase's hosted functions are not the inference host; use a separate GPU worker for a public deployment.

## Enable on a compatible local development host

Create the isolated Python environment and obtain the checkpoint following `START-HERE.md` from the handoff ZIP. Then set these variables in the same PowerShell session used to start AuthentiScan, substituting the actual verified paths:

```powershell
$env:AUTHENTISCAN_LOCALIZATION_ENABLED = '1'
$env:AUTHENTISCAN_LOCALIZATION_MODE = 'mesorch-p'
$env:MESORCH_LOCALIZATION_WEIGHTS = 'D:\path\to\mesorch_p-118.pth'
$env:MESORCH_LOCALIZATION_PYTHON = 'D:\path\to\compatible-python.exe'
```

From `firebase-local`, start the normal cloud-connected development app with `npm run start:cloud`. The launcher starts the model service on loopback port 5014 only when the checkpoint and Python executable exist. It verifies the service identity and checkpoint digest. If the optional service is unavailable, the scan and classifier continue; the localization panel reports that no localization result is available.

To turn the integration off in the current PowerShell session:

```powershell
Remove-Item Env:AUTHENTISCAN_LOCALIZATION_ENABLED -ErrorAction SilentlyContinue
Remove-Item Env:AUTHENTISCAN_LOCALIZATION_MODE -ErrorAction SilentlyContinue
```

## User-facing limits

The feature is titled **Suspected edit regions**. Orange marks are review suggestions, not confirmed edits. The classifier and Grad-CAM remain independent. The current development holdout missed annotated edited areas in 13 of 24 edited images and highlighted areas in 7 of 12 authentic images. These results fail the project's screening gates; the panel and PDF disclose them in their technical/limitations details. Do not present the mask as proof or as a reliable determination of AI authorship. Independent final testing is still required.

The integration has not been run end-to-end in this workspace: the checkpoint and compatible CUDA environment are not present here.
