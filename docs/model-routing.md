# Capability and model routing

Roles advertise capabilities such as `repository-reading`, `code-editing`, `testing`, and `review`. `selectRole` deterministically scores capability matches, workload, and historical failures; a model suggestion is never sufficient to grant permissions. Role-specific models can be selected by the host configuration and fall back to the global provider.
