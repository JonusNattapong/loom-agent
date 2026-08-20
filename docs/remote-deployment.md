# Remote worker deployment

Controller config:

```json
{"remote":{"enabled":true,"listen":{"host":"127.0.0.1","port":4778},"tokenEnv":"LOOM_WORKER_TOKEN"}}
```

Run the controller with `loom daemon start --foreground`. Run a worker with `LOOM_WORKER_TOKEN=... loom worker start --controller wss://loom.example.com/v1/workers/connect --id gpu-01`. Worker identity is stable; each process gets a new instance identity and each connection gets a new epoch.

The controller rejects a non-loopback worker listener unless `remote.tlsCertFile` and `remote.tlsKeyFile` configure native TLS. Alternatively, keep the listener on `127.0.0.1` and let a reverse proxy terminate TLS and forward `/v1/workers/connect` locally. Never expose bearer-authenticated worker traffic over cleartext `ws://`. Because the worker initiates outbound WebSocket/HTTPS traffic, typical NAT/CGNAT environments do not require worker port forwarding; this is not universal NAT traversal.

V0.8.1 remains single-controller, with no P2P, STUN/TURN/ICE, QUIC, distributed filesystem, or arbitrary TCP tunneling.
