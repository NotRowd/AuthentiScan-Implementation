"""Replace a generic diagnostic with a fixed, non-sensitive parser error code."""
from pathlib import Path
root=Path.home()/'authentiscan'
path=root/'visual/qwen_service.py'
source=path.read_text()
before="                print('Visual review rejected: ' + diagnostic, flush=True)"
after="""                known = {
                    'Concern needs a complete observation and location': 'incomplete_observation_or_location',
                    'Concern needs a distinct visible reason': 'incomplete_or_repeated_reason',
                    'Unsupported provenance claim': 'unsupported_origin_claim',
                    'Unusable description': 'unusable_internal_description',
                    'Too many anomaly claims': 'too_many_findings',
                    'Non-concern statuses require empty observation/location': 'contradictory_status_fields',
                    'Invalid text field': 'invalid_text_length_or_type',
                    'Invalid or duplicate category/status': 'invalid_category_or_status',
                    'Expected all five named feature checks': 'missing_feature_checks',
                    'Unexpected review fields': 'unexpected_review_fields',
                }
                diagnostic = known.get(str(error), diagnostic)
                print('Visual review rejected: ' + diagnostic, flush=True)"""
if source.count(before)!=1:raise SystemExit('Diagnostic baseline changed; nothing applied.')
path.write_text(source.replace(before,after))
print('Fixed parser diagnostics updated; no credentials or model text logged.')
