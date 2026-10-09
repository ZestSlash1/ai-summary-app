# ARO gateway

Small authenticated proxy in front of Bonsai (llama-server), Ollama, ComfyUI, Hermes, and OmniRoute. Only this process is exposed through the tunnel.
No dependencies, Node 20+.

```
tunnel -> 127.0.0.1:8787 (this gateway) -> /v1/*        -> llama-server 127.0.0.1:8090
                                        -> /comfy/*     -> ComfyUI      127.0.0.1:8188 (allowlist only)
                                        -> /omniroute/* -> OmniRoute    127.0.0.1:20128 (model list and chat only)
                                        -> /ollama/*    -> Ollama       127.0.0.1:11434 (model list and chat only)
```

## Config

Copy values into `tools/gateway/.env.gateway` (git-ignored by the root `.env*` rule). It already exists on this PC with a generated token.

| Variable | Default | Meaning |
|---|---|---|
| `ARO_GATEWAY_TOKEN` | required, 24+ chars | Bearer token every request must send |
| `LLAMA_URL` | `http://127.0.0.1:8090` | llama-server |
| `LLAMA_API_KEY` | empty | If llama-server runs with `--api-key`, the gateway sends this instead of the client token |
| `COMFY_URL` | `http://127.0.0.1:8188` | ComfyUI |
| `HERMES_URL` | `http://127.0.0.1:8642` | Hermes Agent's API server (run `hermes gateway` in WSL) |
| `HERMES_API_KEY` | empty | Hermes's `API_SERVER_KEY`. Empty means Hermes is off and `/hermes/*` answers 503 |
| `HERMES_SKILLS_DIR` | empty | Folder Hermes reads skills from. For Hermes in WSL use the `\\wsl.localhost\Ubuntu\home\<user>\.hermes\skills` path, not the Windows home folder. Empty turns "Install to Hermes" off (503). Skills ARO did not install are never overwritten |
| `OMNIROUTE_URL` | `http://127.0.0.1:20128` | OmniRoute |
| `OMNIROUTE_API_KEY` | empty | If OmniRoute requires an API key, the gateway sends this instead of the client token |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama. Ollama has no auth, so there is no key. `off` turns `/ollama/*` off (503) |
| `GPU_ARBITRATION` | `sleep` | `sleep`: image jobs wait for llama-server to sleep. `off`: no arbitration |
| `SLEEP_WAIT_MS` | 60000 | How long an image job waits for Bonsai to release the GPU |
| `JOB_TIMEOUT_MS` | 300000 | Longest an image job can hold the GPU lock |
| `MAX_BODY_BYTES` | 20971520 | Request size cap |
| `RATE_PER_MINUTE` | 240 | Global request cap |

## Run

```powershell
cd C:\Users\falcon\ai-summary-app
node tools/gateway/server.mjs
```

Start llama-server (normal, non-elevated PowerShell) so the GPU can be released for image jobs:

```powershell
cd C:\Users\falcon\Bonsai-demo
$env:BONSAI_CTX = "32768"
.\scripts\start_llama_server.ps1 --sleep-idle-seconds 20
```

Optional defense in depth: add `--api-key <key>` there and set the same value as `LLAMA_API_KEY`.

## Tunnel (Tailscale Funnel, recommended)

1. Open the Tailscale app from the Start menu and sign in. (`tailscale status` must stop saying `NoState`.)
2. In the Tailscale admin console, enable HTTPS certificates and Funnel for this machine when prompted.
3. Publish the gateway:

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" funnel --bg 8787
& "C:\Program Files\Tailscale\tailscale.exe" funnel status
```

The status output shows the public `https://<machine>.<tailnet>.ts.net` URL. Stop it with `tailscale funnel --https=443 off`.

Alternative with a Cloudflare domain: named tunnel to `http://127.0.0.1:8787`. Quick tunnel (`cloudflared tunnel --url http://127.0.0.1:8787`)
gives a random URL that changes on every restart, so use it only for testing.

## ARO environment

Local `.env.local` and Vercel project env (never commit):

```
BONSAI_BASE_URL=https://<public-url>/v1
BONSAI_API_KEY=<ARO_GATEWAY_TOKEN>
COMFYUI_BASE_URL=https://<public-url>/comfy
COMFYUI_API_KEY=<ARO_GATEWAY_TOKEN>
```

OmniRoute needs nothing more: with `OMNIROUTE_BASE_URL` unset, ARO reaches it at `https://<public-url>/omniroute/v1`
with `BONSAI_API_KEY`. Only local development sets `OMNIROUTE_BASE_URL=http://localhost:20128/v1`.

Ollama is the same: set `OLLAMA_BASE_URL=https://<public-url>/ollama/v1` and `OLLAMA_API_KEY=<ARO_GATEWAY_TOKEN>` in
production. Local development can point straight at Ollama: `OLLAMA_BASE_URL=http://127.0.0.1:11434/v1` with no key. Models and
their context window are set up in `tools/ollama/` (Ollama's OpenAI endpoint cannot set the window per request, so each model
gets it from a Modelfile).

Never publish Ollama's own port (11434) either. Its native API can pull, copy, and delete models.

Never publish OmniRoute's own port (no ngrok, Funnel, or Cloudflare tunnel to 20128). Its dashboard and `/api` routes
answer without a login, and `/api/providers` returns every provider key.

## What is allowed

- `POST /v1/chat/completions`, `POST /v1/completions`, `GET /v1/models`
- `POST /comfy/upload/image`, `POST /comfy/prompt`, `GET /comfy/history/{id}`, `GET /comfy/view`, `POST /comfy/free`, `POST /comfy/interrupt`, `GET /comfy/system_stats`, `GET /comfy/queue`
- `GET /omniroute/v1/models`, `POST /omniroute/v1/chat/completions`
- `GET /ollama/v1/models`, `POST /ollama/v1/chat/completions` (Ollama's native `/api/*` stays local)
- `GET /status` returns `{ bonsai: online|sleeping|busy|offline, comfy: online|busy|offline, ... }`

Everything else is 404. No WebSockets. Paths containing `..`, encoded slashes, backslashes, or `//` are rejected.

## GPU behavior

- While an image job is queued or running, `/v1/chat/completions` and `/v1/completions` return `503` with `Retry-After: 5` (`type: gpu_busy`).
- `POST /comfy/prompt` returns `503` if a chat is streaming, or if llama-server does not go to sleep within `SLEEP_WAIT_MS`
  (`type: bonsai_not_idle`, meaning it was started without `--sleep-idle-seconds`).
- `POST /ollama/v1/chat/completions` follows the same rules as Bonsai chat: `503 gpu_busy` during an image job, and it counts as a
  running chat that makes an image job wait. Before an image job starts, the gateway asks Ollama to unload whatever it holds
  (`keep_alive: 0`), so a model Ollama was keeping warm cannot starve ComfyUI. Bonsai and Ollama still share the one 12 GB card:
  use one at a time, or set `OLLAMA_KEEP_ALIVE=60s` so Ollama lets go quickly.
- Bonsai wakes on its next chat request, which takes roughly 10 to 20 seconds to reload.
- `GET /v1/models` never wakes the model.

## Test

```powershell
node --test tools/gateway/gateway.test.mjs
```

Ten tests with fake upstreams: auth, allowlist, token swap, streaming, body limit, GPU locking both ways, `gpu off`, status.

## Known limits

- ComfyUI is not installed yet, so the image path is tested with a fake upstream only.
- The lock is in memory. Restarting the gateway clears it.
- Rate limit is global, not per client (behind Funnel every client shares one address).
- Reasoning: Bonsai returns `reasoning_content` and it can use the whole `max_tokens` budget, leaving `content` empty. ARO must allow enough tokens.
