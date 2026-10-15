# Cue Us In

A private, two-person cinema room for streaming your screen or a local movie, with optional webcams, voice and a small live chat. Built in TypeScript with React, Express, Socket.IO and browser WebRTC. Runs on your own computer; no Netlify or media hosting account is required for direct connections.

## Start locally

Requires Node.js 22.6+ (Node 24 recommended). Dependencies are already installed on this machine.

```powershell
cd "path\to\Cue Us In"
npm install
npm run build
npm start
```

Open http://localhost:5185. Or double-click **Start Cue Us In.cmd**, which builds and starts the app. Leave its window open. Development mode is `npm run dev` on the same port. The server binds to 127.0.0.1 by default; no router port forwarding is necessary for the website when using a tunnel.

## Invite someone through Cloudflare Tunnel

1. Keep the local server running.
2. In another terminal, run `cloudflared tunnel --url http://127.0.0.1:5185`, or double-click **Share Cue Us In.cmd**. Cloudflared is already installed on this computer.
3. Open the printed **HTTPS trycloudflare.com address yourself**, enter your name and create a room there. Create the room on that public origin, so the invite and your host session use the same address.
4. Click **Invite your person** and send that full link privately to your guest. They enter their name and join in their browser. No software installation is needed for them.
5. Keep the computer awake and both terminal windows running. Closing either ends access. Quick Tunnel addresses change when restarted. For a permanent address, create a named Cloudflare Tunnel on your own domain and point it at the same local port.

Do not send a localhost link to someone on another machine. The public HTTPS link is also needed for camera, microphone and screen-capture permissions outside localhost. The room identifier in the URL fragment is an unguessable invitation credential. Anyone holding it can take the one guest seat, so treat it as private. It is not a password-protected user account system. Host ownership is a separate random key held in that tab's session storage; guests cannot take the host seat with the invite alone.

## Watching together

- **Share screen:** Desktop Chrome or Edge is recommended. Select a browser tab and enable **Share tab audio** for the most reliable picture + sound. Sharing a whole monitor or media player window may omit audio depending on the browser and OS. The app reports when no audio track was captured. Camera and microphone permissions are requested only when you turn them on.
- **Choose a movie:** Select a file on your computer, then click **Stream movie**. The host's browser decodes it and sends its picture and audio over WebRTC. The file is not uploaded to the app server or sent as an HTTP download through the tunnel. The host controls play, pause and seeking with the video controls. The guest receives the live output. Prefer MP4 with H.264/AAC or WebM. MKV, HEVC, DTS and other codecs may not play in a browser; share your desktop player instead. Local file capture requires a browser supporting `HTMLMediaElement.captureStream()`; desktop Chrome/Edge is the primary target.
- **Voice + webcams:** Both people can enable their camera and mic independently of the movie. Headphones avoid audio echo. Camera/mic are off initially and released when switched off or when leaving. Movie sound and conversation use separate audio tracks. Guests can mute the movie without muting the call. If autoplay is blocked, click **Enable playback**.
- **Settings:** 720p / 1080p / 1440p and 30 / 60 fps targets. The defaults are 1080p30 at up to 8 Mbps for the movie stream; 1440p targets up to 14 Mbps, 720p up to 4 Mbps. Webcam traffic adds to this. VP9 is preferred where supported. Actual quality depends on source resolution, encoder performance, upload capacity, congestion and the receiving device. Local file streams are scaled down to the selected target; selecting a higher target does not upscale the source. Resolution/frame rate shown while streaming comes from the WebRTC statistics, not a guaranteed label.
- **Chat:** Delivered through your local signaling server and limited to the two room members. The latest 100 messages are retained in RAM for that room. Chat is not recorded to disk. Rooms expire after 30 minutes without participants; restarting the server clears all rooms and messages. Use a fresh room for a new session.

## Connecting across different networks

Cloudflare Tunnel carries the web page, room signaling and chat over HTTPS/WebSockets. **It does not relay the WebRTC video/audio.** Browsers first attempt a direct encrypted connection, using Cloudflare's public STUN service to discover network addresses. Some NATs, firewalls and mobile networks require a TURN relay. A successful same-machine test does not prove both home networks will connect.

For reliable remote use, copy `.env.example` to `.env` and set `TURN_URLS`, `TURN_USERNAME` and `TURN_CREDENTIAL` from a TURN provider, then restart the server. URLs may be comma-separated. Use short-term TURN client credentials with a lifetime longer than your expected session. These client credentials must reach room participants; never paste a provider's management API key into these fields. `.env` is ignored by Git. `RELAY_ONLY=true` lets you test whether the configured relay actually works. There is no relay account or paid service configured in this project.

If the room chat works but video remains connecting or fails, check TURN first and use **Settings → Reconnect video**. Keep media connections separate from the HTTP tunnel. This app does not proxy movie files through Cloudflare's general CDN or bypass protected-content capture restrictions. DRM-protected players may produce a black picture.

References: [Cloudflare Tunnel WebSockets](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/), [Cloudflare STUN and TURN](https://developers.cloudflare.com/realtime/turn/generate-credentials/), [screen audio support](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia), [local media capture](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/captureStream).

## Verification and maintenance

`npm run build` checks TypeScript and builds the production frontend. `npm test` runs unit and live two-client Socket.IO integration tests: seat limits, host ownership, invite isolation, chat, signaling and reconnect history.

For a generated-media browser test, set `CUE_TESTING=true`, run `npm run dev`, and open http://localhost:5185/__rtc-test. It connects two WebRTC peers with generated 1080p video, a separate synthetic camera and two synthetic audio sources. It does not request webcam/microphone access. This test page is unavailable during normal startup and production mode. Real device permissions, protected-content behavior and connections across two external networks require testing on the actual machines.

The server accepts same-origin signaling, caps rooms at two seats, bounds messages and event rates, and retains only temporary in-memory state. Media uses WebRTC transport encryption. This is a personal two-person app, without recording, file uploads, public room discovery or a full conferencing service. Use browser updates and keep `.env` and invite links private.
