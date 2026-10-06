# Agent notes

- Pure static site (no build, no deps). Three.js r128 and Google Fonts load from CDN.
- Served by python http.server in `docker-compose.base44.yml` with the repo bind-mounted read-only; edits are live on browser reload (no HMR).
- Verify: `curl localhost:3000/` returns index.html; game needs WebGL in the browser.
