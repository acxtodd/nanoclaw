# Local installation customizations

This fork runs NanoClaw 2.4 with WhatsApp and the OneCLI credential gateway.

- Keep Baileys pinned to 7.0.0-rc14 or a later verified patched release. The
  upstream skill at v2.4.0 pins vulnerable rc9; the local skill corrects it.
- WhatsApp push-to-talk audio is transcribed locally by `src/transcription.ts`
  using host `ffmpeg`, `whisper-cli`, and `data/models/ggml-base.bin`.
  The channel hook preserves the original audio attachment.
- Reapplying `/add-whatsapp` overwrites the adapter. Reapply the transcription
  hook in `downloadInboundMedia` and its caller, then run the transcription and
  WhatsApp registration tests. Do not accept a downgrade to rc9.
- The base Dockerfile installs the Python MCP runtime in `/opt/acx-kb` and the
  PDF reader. Standard image rebuilds and per-group package builds inherit them.
- The local ACX MCP server is installation data under the group's `integrations/`
  directory. Its configured command is `/opt/acx-kb/bin/python`. Set the server's
  `REQUESTS_CA_BUNDLE` to `/tmp/onecli-combined-ca.pem` so Python Requests trusts
  the credential gateway. Keep endpoint/user configuration and credentials out
  of this repository.
- macOS service setup includes Homebrew and the selected Node directory on PATH.
- Model selection uses `NANOCLAW_DEFAULT_MODEL` and the group's native model
  setting. The legacy `CLAUDE_MODEL` variable is no longer used by v2.

After updates, build the host, run tests, rebuild the base image when its inputs
change, and verify the service, WhatsApp, model, local voice, and MCP tools.
Keep the original v1 checkout and the full state snapshot until rollback is no
longer needed. A Git tag alone does not restore credentials or databases.
