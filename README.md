# Cavalry Bridge for Claude

Let Claude **see, edit and preview your [Cavalry](https://cavalry.studio) scene**: read layers and connections, change attributes with JavaScript, hook nodes together, switch Duplicator distributions, and render a frame to check the result.

English | [Русский](README.ru.md)

## Install (2 steps, no terminal)

1. **Download** `cavalry-claude-bridge.mcpb` from the [latest release](../../releases/latest) and **double-click it**. Claude Desktop opens an install dialog: click **Install**.
   (Or: Claude Desktop → Settings → Extensions → drag the file in.)
2. **In Cavalry** run **Scripts → Stallion**. The window should say `Listening on 127.0.0.1:8080`.

Now ask Claude: *"Show me my Cavalry scene."* Claude asks for permission before each tool call.

You do **not** need to install Node.js or edit any config file: Claude Desktop ships its own Node.js, and the `.mcpb` contains the whole server in one file.

## Requirements

| What | Notes |
|---|---|
| Cavalry with JavaScript scripting | Scripting is a Professional-licence feature in Cavalry; Starter licences can only run encrypted scripts ([docs](https://docs.cavalry.scenegroup.co/tech-info/scripting/getting-started)). |
| Stallion running in Cavalry | `Scripts → Stallion`. If it is missing from your Scripts menu, see [Stallion](https://github.com/scenery-io/stallion). |
| Claude Desktop (Windows or macOS) | Works with a free Claude account. macOS is untested by the author. |

## What Claude can do

| Tool | What it does |
|---|---|
| `cavalry_get_scene` | Snapshot of the scene: hierarchy, changed attributes, expressions, animation, **connections between nodes**. |
| `cavalry_execute_script` | Runs JavaScript in Cavalry and returns the result, `console.log` output and readable errors. |
| `cavalry_connect` | Connects two nodes. Creates missing array slots, replaces a taken input, and **verifies** the result (Cavalry's own `api.connect` fails silently). |
| `cavalry_set_distribution` | Changes a Duplicator's distribution (circle, fibonacci, grid, linear, ...). |
| `cavalry_render_frame` | Renders the current frame to a PNG so Claude can look at the result. |
| `cavalry_api_search` | Searches the installed Cavalry API by name, so Claude does not guess function names. |
| `cavalry_help` | Short, verified notes about the API and its pitfalls, by topic (see [`knowledge/api-notes.md`](knowledge/api-notes.md)). |

Try: *"Put a Fibonacci duplicator on the circle and add a Random to the clone positions"*, *"Which layers are connected to the Duplicator?"*, *"Render the frame and tell me what looks off"*.

### Spend fewer tokens
- Name layers by id (`duplicator#1`) when you can, so Claude does not need to search.
- Claude reads the API notes with `cavalry_help` on demand instead of you pasting them into the chat.
- Renders default to 50% size; ask for a bigger one only when you need detail.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Cannot reach Cavalry at http://127.0.0.1:8080" | Start `Scripts → Stallion` in Cavalry. If the window shows another port, set it in Claude Desktop → Settings → Extensions → Cavalry Bridge → **Stallion port**. |
| "Timeout: no response from Cavalry" | Scripting may be blocked by your licence, or the script is still running. |
| Tools do not appear | Fully quit Claude Desktop (system tray → Quit) and start it again. |
| `Argument count does not match function definition` | The API function exists but was called with the wrong number of arguments. Ask Claude to use `cavalry_api_search`. |

## Safety

Claude can run **any JavaScript inside Cavalry**, including deleting layers. This isn't limited to the scene: Cavalry's own scripting API can make outbound network requests, open arbitrary URLs or local `file://` paths, and run its own HTTP server — all from your machine. **Save your scene** before letting it make big changes, and read the permission prompts. Stallion itself listens on `127.0.0.1` only; run it when you need it.

## Use with other MCP clients (Claude Code, Cursor, ...)

The `.mcpb` is a zip file: unzip it and use `server/index.js`, or build from source (below).

```json
{
  "mcpServers": {
    "cavalry": {
      "command": "node",
      "args": ["/absolute/path/to/server/index.js"],
      "env": { "CAVALRY_PORT": "8080" }
    }
  }
}
```

## How it works

```
Claude Desktop ──stdio (MCP)──> server/index.js ──HTTP POST──> Stallion (in Cavalry, 127.0.0.1:8080)
                                       ^                              │ runs the script, then
                                       └──────── temp JSON file <──── api.writeToFile(result)
```

Stallion accepts scripts but does not return their result, so every script is wrapped: it runs inside `try/catch`, captures `console.log`, and writes a JSON result file that the server reads back. Cavalry's API throws plain strings, which the wrapper turns into readable errors.

## Build from source

```bash
git clone <this repo> && cd cavalry-claude-bridge
npm install
npm run build      # type-check + bundle to server/index.js
npm test           # end-to-end test against a fake Cavalry
npm run pack       # dist/cavalry-claude-bridge.mcpb
```

Releasing: bump `version` in `manifest.json` and `package.json`, then push a tag `vX.Y.Z`. The workflow builds, tests and attaches the `.mcpb` to a GitHub release.

The Cavalry API notes live in [`knowledge/api-notes.md`](knowledge/api-notes.md) (split into topics by `##` headings and served by `cavalry_help`). Corrections are welcome: every line should be something you verified on a real scene.

Optional: [`extras/skill`](extras/skill) is a Claude Skill with the same notes, for plans that support Skills. The extension does not need it.

## Credits

- [Stallion](https://github.com/scenery-io/stallion) by scenery.io: the bridge inside Cavalry.
- [kacperchlebowicz/Cavalry-mcp](https://github.com/kacperchlebowicz/Cavalry-mcp): an earlier Cavalry MCP server (MIT) that this project started from.

Not affiliated with Scene Group (Cavalry) or Anthropic.

## License

MIT, see [LICENSE](LICENSE).
