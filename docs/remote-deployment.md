# Remote worker deployment

Controller config:

```json
{"remote":{"enabled":true,"listen":{"host":"127.0.0.1","port":4778},"tokenEnv":"LOOM_WORKER_TOKEN"}}
```

Run the controller with `loom daemon start --foreground`. Run a worker with `LOOM_WORKER_TOKEN=... loom worker start --controller wss://loom.example.com/v1/workers/connect --id gpu-01`. Worker identity is stable; each process gets a new instance identity and each connection gets a new epoch.

A reverse proxy may terminate TLS and forward `/v1/workers/connect` to `127.0.0.1:4778`. Because the worker initiates outbound WebSocket/HTTPS traffic, typical NAT/CGNAT environments do not require worker port forwarding; this is not universal NAT traversal.

V0.8.1 remains single-controller, with no P2P, STUN/TURN/ICE, QUIC, distributed filesystem, or arbitrary TCP tunneling.
