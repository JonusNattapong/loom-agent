# Discord transport

Loom V0.5.1 includes a `DiscordTransport` adapter built on `discord.js` 14.x. It implements the shared `BotTransport` boundary and normalizes inbound DM, mention, and thread messages into `BotEvent` values. Bot-authored messages are ignored to prevent feedback loops.

## Configuration

Bot tokens are environment-only:

```powershell
$env:DISCORD_BOT_TOKEN="..."
```

A bot definition references the variable with `transport.tokenEnv`; the resolved token is not persisted or included in traces. Run the bot through the runtime command once the bot runner is configured:

```text
loom bot run oracle
```

The adapter's unit tests use a fake client and do not require Discord credentials. **Adapter implemented; live Discord smoke test skipped** when no safe test token/guild is available.

Required gateway intents are Direct Messages, Guilds, Guild Messages, and Message Content for message normalization. Enable only the intents required by the Discord application.
