"""Isolated prompt candidate; not selected by the production service."""
from evaluate_visual_candidate import PROMPT

VERSION = 'grounded-review-candidate-v1'
PROMPT_CANDIDATE = PROMPT + '''
Ground every sentence in details you can actually see. Do not guess names, identities, text on clothing, labels, places, or camera settings. Describe unreadable text as text, without transcribing it.
First check what is visible and assessable. Blur, compression, low resolution, a tilted camera, partial occlusion, or a person looking sideways alone are NOT visual inconsistencies. Use unable_to_assess when they prevent a reliable check. Do not turn an image-quality limitation into a possible_concern.
For scene, compare objects with their immediate visible surroundings: a surface intersection, a disconnected part, or conflicting contact/shadow can be a concrete concern. Describe the visible relationship, not an invented cause. Do not infer unseen events, geography, or intent. An unusual but physically possible object or setting is not itself a concern.
For each possible_concern, use one concise sentence identifying the specific mismatch and a plain-language location. Do not force a concern when none is clearly visible. No claim of certainty, proof, or image provenance.'''
