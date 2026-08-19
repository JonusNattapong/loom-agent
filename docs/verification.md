# Verification

`selectTests` first maps changed paths to known tests and returns `targeted`; when no safe match exists it returns `full`. Model-ranked tests must be checked against workspace policy before execution. Multi-round execution is bounded by model-round and tool-call limits, checkpoints after tool results, and distinguishes model claims from runtime evidence.
