# Audit engine

Scanners implement `scan(context) -> Finding[]`; scanner code has no UI or unrelated persistence concerns. Findings carry stable IDs, severity, evidence, affected URL, recommendation, business impact, metadata, and score impact. The worker pipeline is the extension point for discovery, safe fetching, parsing, scanning, and finalization.
