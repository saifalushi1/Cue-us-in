@echo off
cd /d "%~dp0"
echo Keep the Cue Us In server running in its other window.
echo Open the HTTPS address below, create a room there, and copy its invite.
cloudflared tunnel --url http://127.0.0.1:5185
pause
