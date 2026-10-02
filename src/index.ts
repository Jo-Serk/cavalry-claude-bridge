import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { runScript, renderFrame } from "./bridge.js";
import { SCENE_JS, apiSearchJs, connectJs, setDistributionJs, getKeyframesJs, parentJs, lookupEnumJs } from "./scripts.js";
import { helpText } from "./knowledge.js";
import enumDb from "../knowledge/cavalry-enum-db.json";

const INSTRUCTIONS = [
  "You are connected to the user's open Cavalry scene through Stallion.",
  "Before editing, call cavalry_get_scene; after editing, verify with cavalry_get_scene and cavalry_render_frame.",
  "Use cavalry_connect for connections and cavalry_set_distribution for Duplicator distribution.",
  "Before writing non-trivial scripts call cavalry_help (topic 'gotchas' first).",
  "Never guess API function names: use cavalry_api_search. For parenting use cavalry_parent (not cavalry_connect). For enum/dropdown labels use cavalry_lookup_enum on a real layer.",
].join(" ");

const server = new Server(
  { name: "cavalry-claude-bridge", version: "1.1.0" },
  { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "cavalry_execute_script",
      description: "Execute JS inside Cavalry. The value of the LAST expression is returned (wrap in (function(){ ... return x; })(); to use return); console.log is captured. API errors are plain strings. Prefer cavalry_connect and cavalry_set_distribution for those jobs. Before non-trivial scripts call cavalry_help.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string" }
        },
        required: ["code"],
      },
    },
    {
      name: "cavalry_get_scene",
      description: "Full snapshot of the scene: hierarchy, non-default attrs, expressions, connections. Call this before and after editing.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "cavalry_api_search",
      description: "Search the Cavalry API. Returns functions/layer types matching regex.",
      inputSchema: {
        type: "object",
        properties: { pattern: { type: "string" } },
        required: ["pattern"],
      },
    },
    {
      name: "cavalry_connect",
      description: "Connect an output of one node to an attribute of another (default output: id). Creates missing array slots (e.g. shapes.0, behaviour.1.id), replaces an existing input unless replace=false, and VERIFIES the result: it fails with an error if the connection was not created.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Source node id, e.g. random#1" },
          to: { type: "string", description: "Target node id, e.g. duplicator#1" },
          toAttr: { type: "string", description: "Target attribute, e.g. shapePosition or shapes.0" },
          fromAttr: { type: "string", description: "Source attribute (default: id)" },
          replace: { type: "boolean", description: "Replace an existing input (default: true)" }
        },
        required: ["from", "to", "toAttr"],
      },
    },
    {
      name: "cavalry_set_distribution",
      description: "Change the Distribution type of a Duplicator (circle, fibonacci, grid, linear, random, rose, path, and so on) and return the new generator attributes with their values. Fails if the type was not applied.",
      inputSchema: {
        type: "object",
        properties: {
          layer: { type: "string", description: "Duplicator id, e.g. duplicator#1" },
          type: { type: "string", description: "circle, fibonacci, grid, linear, random, rose, ... (or the full name, e.g. circleDistribution)" }
        },
        required: ["layer", "type"],
      },
    },
    {
      name: "cavalry_get_keyframes",
      description: "Read the keyframes of one attribute: a list of {id, time, value}. Requires the exact leaf attribute path (e.g. position.x, not position) - isAnimatedAttribute on a compound name is not reliable for this. Returns { animated: false } if the attribute has no keyframes. Temporarily moves the playhead to read each value, then restores it.",
      inputSchema: {
        type: "object",
        properties: {
          layer: { type: "string", description: "Layer id, e.g. basicShape#1" },
          attr: { type: "string", description: "Exact leaf attribute path, e.g. position.x" },
        },
        required: ["layer", "attr"],
      },
    },
    {
      name: "cavalry_parent",
      description: "Parent one layer to another (api.parent), or unparent it by omitting target. This is the hierarchy relationship, NOT an attribute connection - use cavalry_connect for that. Verifies the result.",
      inputSchema: {
        type: "object",
        properties: {
          child: { type: "string", description: "Layer id to parent, e.g. basicShape#1" },
          target: { type: "string", description: "New parent's layer id. Omit to unparent." },
        },
        required: ["child"],
      },
    },
    {
      name: "cavalry_lookup_enum",
      description: "Get the human-readable label for an enum attribute's numeric value on a real layer (e.g. generator.direction=1 -> 'Vertical'). Checks a bundled, pre-verified label database first (no extra round trip); only asks Cavalry live on a miss. Returns label: null when no label exists anywhere (the attribute is type 'int' pretending to be a dropdown, or an 'enum' rendered as icon buttons with no registered names) - in that case ask the user to confirm it by toggling in the UI.",
      inputSchema: {
        type: "object",
        properties: {
          layer: { type: "string", description: "A real layer id that currently has this attribute, e.g. duplicator#1" },
          attr: { type: "string", description: "Attribute path, e.g. generator.direction" },
          value: { type: "number", description: "The numeric value to label" },
        },
        required: ["layer", "attr", "value"],
      },
    },
    {
      name: "cavalry_help",
      description: "Verified notes about the Cavalry scripting API and its pitfalls. Call without arguments to list topics; call with topic 'gotchas' before writing non-trivial scripts.",
      inputSchema: {
        type: "object",
        properties: { topic: { type: "string", description: "workflow, gotchas, layers, attributes, connections, duplicator, render, keyframes, hierarchy, compositions-and-assets, web-apis, script-ui, dynamic-script-nodes or text-formatting" } },
      },
    },
    {
      name: "cavalry_render_frame",
      description: "Render current frame to PNG and return it as an image to the chat.",
      inputSchema: {
        type: "object",
        properties: { scale: { type: "number", description: "Scale 0.1 to 2 (default 0.5)" } },
      },
    }
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  
  const asText = (res: { text: string; isError: boolean }) => ({
    content: [{ type: "text" as const, text: res.text }],
    isError: res.isError,
  });

  if (name === "cavalry_execute_script") {
    return asText(await runScript(args.code as string));
  }
  if (name === "cavalry_get_scene") {
    return asText(await runScript(SCENE_JS, 20000));
  }
  if (name === "cavalry_api_search") {
    return asText(await runScript(apiSearchJs(args.pattern as string)));
  }
  if (name === "cavalry_render_frame") {
    const scale = Math.min(2, Math.max(0.1, (args.scale as number) || 0.5));
    const r = await renderFrame(scale);
    if ((r as any).pngBase64) {
      return {
        content: [{ type: "image" as const, data: (r as any).pngBase64, mimeType: "image/png" }],
      };
    }
    return asText(r);
  }
  
  if (name === "cavalry_connect") {
    if (typeof args.from !== "string" || typeof args.to !== "string" || typeof args.toAttr !== "string") {
      throw new Error("'from', 'to' and 'toAttr' must be strings");
    }
    return asText(await runScript(connectJs({
      from: args.from,
      to: args.to,
      toAttr: args.toAttr,
      fromAttr: typeof args.fromAttr === "string" ? args.fromAttr : "id",
      replace: args.replace !== false,
    })));
  }
  if (name === "cavalry_set_distribution") {
    if (typeof args.layer !== "string" || typeof args.type !== "string") {
      throw new Error("'layer' and 'type' must be strings");
    }
    return asText(await runScript(setDistributionJs({ layer: args.layer, type: args.type })));
  }
  
  if (name === "cavalry_get_keyframes") {
    if (typeof args.layer !== "string" || typeof args.attr !== "string") {
      throw new Error("'layer' and 'attr' must be strings");
    }
    return asText(await runScript(getKeyframesJs(args.layer, args.attr)));
  }
  if (name === "cavalry_parent") {
    if (typeof args.child !== "string") throw new Error("'child' must be a string");
    const target = typeof args.target === "string" ? args.target : null;
    return asText(await runScript(parentJs(args.child, target)));
  }
  if (name === "cavalry_lookup_enum") {
    if (typeof args.layer !== "string" || typeof args.attr !== "string" || typeof args.value !== "number") {
      throw new Error("'layer', 'attr' and 'value' are required ('value' must be a number)");
    }
    return asText(await runScript(lookupEnumJs(args.layer, args.attr, args.value, enumDb)));
  }

  if (name === "cavalry_help") {
    return asText(helpText(typeof args.topic === "string" ? args.topic : undefined));
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cavalry MCP server running on stdio");
}

main().catch(console.error);
