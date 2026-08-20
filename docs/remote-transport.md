# V0.8.1 reverse tunnel transport

Loom workers initiate an outbound WebSocket connection to the controller at `/v1/workers/connect`. The controller never opens an inbound worker port. Frames carry the existing V0.8 protocol envelopes; the transport does not define a second assignment protocol.

Use `ws://127.0.0.1` for local development only. Use `wss://` for remote deployment. The controller supports direct TLS when configured with a certificate/key, or TLS termination by Caddy/nginx/Traefik in front of a localhost listener. WebSocket ping/pong is separate from Loom worker heartbeat.

Authentication is a first-frame token handshake. The controller stores/verifies only SHA-256 token hashes, binds a credential to an optional worker ID, and rejects normal protocol traffic before authentication. Tokens should be high entropy and supplied through environment variables, never URLs or command-line values.
