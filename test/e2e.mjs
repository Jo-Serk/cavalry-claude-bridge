// End-to-end test: starts the built MCP server, talks to it like Claude Desktop does,
// and answers its scripts with a fake Cavalry that reproduces Cavalry's quirks
// (API errors are thrown as strings, api.connect() fails silently, setGenerator ignores unknown types).
//
// Usage: node test/e2e.mjs [path/to/server/index.js]
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import vm from "node:vm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = process.argv[2] || "server/index.js";
const PORT = 18765;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

// ---- fake Cavalry ---------------------------------------------------------------------------
const nodes = {
  "compNode#1": { name: "Composition 1", type: "compNode", children: ["duplicator#1", "basicShape#1"] },
  "duplicator#1": { name: "Duplicator", type: "duplicator", parent: "compNode#1", arrays: { shapes: 1 }, inputs: { "shapes.0": "basicShape#1.id" }, generator: "gridDistribution" },
  "duplicator#2": { name: "Empty Duplicator", type: "duplicator", arrays: { shapes: 0 }, inputs: {}, generator: "gridDistribution" },
  "basicShape#1": { name: "Rectangle Shape", type: "basicShape", parent: "compNode#1", attrs: { "position.x": 0 }, keyframedAttrs: { "position.x": { ids: ["keyframe#1", "keyframe#2"], times: [0, 24], values: [0, 500] } } },
  "basicShape#2": { name: "Rectangle 2", type: "basicShape", parent: "compNode#1" },
  "null#1": { name: "Null Target", type: "null", parent: "compNode#1" },
  "random#1": { name: "Random", type: "random" },
  "random#2": { name: "Random 2", type: "random" },
};
const KNOWN = ["array", "circle", "custom", "fibonacci", "grid", "linear", "mask", "math", "particle", "path", "point", "random", "rose", "shuffle", "sort", "transform", "voxelize"].map((x) => x + "Distribution");
let lastScale = null;
let currentFrame = 0;
const api = {
  writeToFile: (p, t) => fs.writeFileSync(p, t),
  getAllSceneLayers: () => Object.keys(nodes),
  layerExists: (id) => id in nodes,
  getNiceName: (id) => nodes[id].name,
  getLayerType: (id) => nodes[id].type,
  getParent: (id) => nodes[id].parent || "",
  getChildren: (id) => nodes[id].children || [],
  getAttributes: (id) => (nodes[id].type === "duplicator" ? ["position", "generator.count"] : ["position"]),
  hasAttribute: (id, a) => {
    if (!nodes[id]) return false;
    if (a === "position") return true;
    if (nodes[id].attrs && a in nodes[id].attrs) return true;
    if (nodes[id].keyframedAttrs && a in nodes[id].keyframedAttrs) return true;
    if (a.startsWith("generator.") && nodes[id].generator) return true;
    return false;
  },
  hasAttributeExpression: () => false,
  isAnimatedAttribute: () => false,
  isAttrDefault: (id, a) => a !== "position",
  get: (id, a) => {
    const kf = nodes[id].keyframedAttrs?.[a];
    if (kf) {
      const i = kf.times.indexOf(currentFrame);
      return i !== -1 ? kf.values[i] : kf.values[0];
    }
    if (nodes[id].attrs && a in nodes[id].attrs) return nodes[id].attrs[a];
    return a === "position" ? { x: 1, y: 2 } : 3;
  },
  getInConnectedAttributes: (id) => Object.keys(nodes[id].inputs || {}),
  getInConnection: (id, a) => (nodes[id].inputs || {})[a] || "",
  getOutConnectedAttributes: () => [],
  getOutConnections: () => [],
  getActiveComp: () => "compNode#1",
  getFrame: () => currentFrame,
  setFrame: (f) => { currentFrame = f; },
  getKeyframeIdsForAttribute: (id, a) => nodes[id].keyframedAttrs?.[a]?.ids || [],
  getKeyframeTimes: (id, a) => nodes[id].keyframedAttrs?.[a]?.times || [],
  parent: (child, target) => { nodes[child].parent = target; },
  unParent: (child) => { delete nodes[child].parent; },
  getDropdownNiceName: (id, a, v) => (a === "generator.count" && v === 3 ? "Three" : ""),
  getSelection: () => [],
  getArrayCount: (id, a) => {
    const n = nodes[id].arrays?.[a];
    if (n === undefined) throw "Attribute not found: " + a;
    return n;
  },
  addArrayIndex: (id, a) => nodes[id].arrays[a]++,
  disconnectInput: (id, a) => { delete nodes[id].inputs[a]; },
  connect: (from, fa, to, ta) => {
    // Cavalry fails SILENTLY when the slot is missing, the input is taken, or the attribute is unknown.
    const n = nodes[to]; n.inputs ||= {};
    const m = ta.match(/^(.+)\.(\d+)/);
    if (m && !(n.arrays && n.arrays[m[1]] > Number(m[2]))) return;
    if (n.inputs[ta]) return;
    if (!/^(shapePosition|shapes\.\d+)$/.test(ta)) return;
    n.inputs[ta] = from + "." + fa;
  },
  getCurrentGeneratorType: (id) => nodes[id].generator,
  getCurrentGenerator: (id) => nodes[id].generator + "#1",
  setGenerator: (id, attr, t) => { if (KNOWN.includes(t)) nodes[id].generator = t; },
  renderPNGFrame: (p, s) => { lastScale = s; fs.writeFileSync(p, PNG); },
  filePathExists: (p) => fs.existsSync(p),
  getAllLayerTypes: () => [{ name: "Duplicator", type: "duplicator" }],
  boom: () => { throw "Argument count does not match function definition."; },
};
const quiet = { log() {}, warn() {}, error() {}, info() {} };
const stallion = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { code } = JSON.parse(body);
    try { vm.runInNewContext(code, { api, console: quiet }); } catch (e) { console.error("sandbox error:", e); }
    res.end("ok");
  });
}).listen(PORT);

// ---- test runner ----------------------------------------------------------------------------
const client = new Client({ name: "e2e", version: "1" });
await client.connect(new StdioClientTransport({ command: "node", args: [SERVER], env: { CAVALRY_PORT: String(PORT) } }));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { isError: !!r.isError, text: r.content[0].type === "text" ? r.content[0].text : "", content: r.content };
};
let passed = 0, failed = 0;
const test = async (label, fn) => {
  try { await fn(); passed++; console.log("  ok   " + label); }
  catch (e) { failed++; console.log("  FAIL " + label + "\n       " + String(e.message).split("\n")[0]); }
};

await test("lists the 10 tools", async () => {
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["cavalry_api_search", "cavalry_connect", "cavalry_execute_script", "cavalry_get_keyframes", "cavalry_get_scene", "cavalry_help", "cavalry_lookup_enum", "cavalry_parent", "cavalry_render_frame", "cavalry_set_distribution"]);
});
await test("sends server instructions", () => assert.match(client.getInstructions() || "", /cavalry_get_scene/));
await test("execute: returns the last expression", async () => assert.equal((await call("cavalry_execute_script", { code: "1 + 2" })).text, "3"));
await test("execute: returns objects as JSON", async () => assert.match((await call("cavalry_execute_script", { code: "(function(){ return {a:[1,2]}; })();" })).text, /"a"/));
await test("execute: captures console.log", async () => { const r = await call("cavalry_execute_script", { code: "console.log('hello', {x:1}); 'done'" }); assert.match(r.text, /\[console\]\nhello \{"x":1\}/); assert.match(r.text, /done/); });
await test("execute: says when nothing was returned", async () => assert.match((await call("cavalry_execute_script", { code: "var x = 1;" })).text, /returned no value/));
await test("execute: shows string errors thrown by the API", async () => { const r = await call("cavalry_execute_script", { code: "api.boom()" }); assert.ok(r.isError); assert.match(r.text, /Argument count does not match/); });
await test("get_scene: hierarchy and connections", async () => { const s = JSON.parse((await call("cavalry_get_scene")).text); assert.equal(s.layers.length, Object.keys(nodes).length); assert.equal(s.layers.find((l) => l.id === "duplicator#1").connectionsIn["shapes.0"], "basicShape#1.id"); });
await test("connect: connects and verifies", async () => { const r = await call("cavalry_connect", { from: "random#1", to: "duplicator#1", toAttr: "shapePosition" }); assert.ok(!r.isError); assert.match(r.text, /random#1\.id -> duplicator#1\.shapePosition/); });
await test("connect: repeating is a no-op", async () => assert.match((await call("cavalry_connect", { from: "random#1", to: "duplicator#1", toAttr: "shapePosition" })).text, /already connected/));
await test("connect: replace=false refuses to overwrite", async () => { const r = await call("cavalry_connect", { from: "random#2", to: "duplicator#1", toAttr: "shapePosition", replace: false }); assert.ok(r.isError); assert.match(r.text, /already connected to random#1\.id/); });
await test("connect: replaces an input by default", async () => { const r = await call("cavalry_connect", { from: "random#2", to: "duplicator#1", toAttr: "shapePosition" }); assert.ok(!r.isError); assert.match(r.text, /"replaced": "random#1\.id"/); });
await test("connect: creates a missing array slot", async () => { const r = await call("cavalry_connect", { from: "basicShape#1", to: "duplicator#2", toAttr: "shapes.0" }); assert.ok(!r.isError); assert.match(r.text, /"addedSlots": 1/); });
await test("connect: catches a silent failure", async () => { const r = await call("cavalry_connect", { from: "random#1", to: "duplicator#2", toAttr: "noSuchAttr" }); assert.ok(r.isError); assert.match(r.text, /connection was not created/); });
await test("connect: rejects missing arguments", async () => { await assert.rejects(call("cavalry_connect", { from: "random#1" })); });
await test("set_distribution: changes the type", async () => { const r = await call("cavalry_set_distribution", { layer: "duplicator#1", type: "circle" }); assert.ok(!r.isError); assert.match(r.text, /"after": "circleDistribution"/); });
await test("set_distribution: reports an unknown type", async () => { const r = await call("cavalry_set_distribution", { layer: "duplicator#1", type: "intersections" }); assert.ok(r.isError); assert.match(r.text, /was not applied/); });
await test("set_distribution: refuses non-duplicators", async () => { const r = await call("cavalry_set_distribution", { layer: "basicShape#1", type: "circle" }); assert.ok(r.isError); assert.match(r.text, /not a duplicator/); });
await test("render_frame: returns a PNG and scales in percent", async () => { const r = await call("cavalry_render_frame", { scale: 0.5 }); assert.equal(r.content[0].type, "image"); assert.equal(r.content[0].mimeType, "image/png"); assert.equal(lastScale, 50); });
await test("api_search: finds functions", async () => assert.match((await call("cavalry_api_search", { pattern: "sceneLayers" })).text, /getAllSceneLayers/));
await test("help: lists topics", async () => assert.match((await call("cavalry_help")).text, /gotchas/));
await test("help: returns a topic", async () => assert.match((await call("cavalry_help", { topic: "gotchas" })).text, /SILENTLY/));
await test("help: unknown topic is an error", async () => assert.ok((await call("cavalry_help", { topic: "nope" })).isError));
await test("get_keyframes: reads values by scrubbing the frame, then restores it", async () => {
  const r = await call("cavalry_get_keyframes", { layer: "basicShape#1", attr: "position.x" });
  assert.ok(!r.isError);
  const parsed = JSON.parse(r.text);
  assert.equal(parsed.animated, true);
  assert.deepEqual(parsed.keyframes.map((k) => k.value), [0, 500]);
  assert.equal(currentFrame, 0); // playhead restored
});
await test("get_keyframes: not animated is honest, not an error", async () => {
  const r = await call("cavalry_get_keyframes", { layer: "basicShape#2", attr: "position" });
  assert.ok(!r.isError);
  assert.match(r.text, /"animated": false/);
});
await test("get_keyframes: unknown leaf path is an error", async () => {
  const r = await call("cavalry_get_keyframes", { layer: "basicShape#1", attr: "position.z" });
  assert.ok(r.isError);
  assert.match(r.text, /not found/);
});
await test("parent: parents and verifies", async () => {
  const r = await call("cavalry_parent", { child: "basicShape#2", target: "null#1" });
  assert.ok(!r.isError);
  assert.match(r.text, /"parent": "null#1"/);
});
await test("parent: omitting target unparents", async () => {
  const r = await call("cavalry_parent", { child: "basicShape#2" });
  assert.ok(!r.isError);
  assert.match(r.text, /"parent": null/);
});
await test("lookup_enum: hits the bundled static DB without a live call", async () => {
  const r = await call("cavalry_lookup_enum", { layer: "duplicator#1", attr: "generator.distributionMode", value: 1 });
  assert.ok(!r.isError);
  assert.match(r.text, /"source": "static-db"/);
  assert.match(r.text, /"label": "Step"/);
});
await test("lookup_enum: falls back live on a DB miss", async () => {
  const r = await call("cavalry_lookup_enum", { layer: "duplicator#1", attr: "generator.count", value: 3 });
  assert.ok(!r.isError);
  assert.match(r.text, /"source": "live"/);
  assert.match(r.text, /"label": "Three"/);
});
await test("lookup_enum: an honest null when nothing has a label", async () => {
  const r = await call("cavalry_lookup_enum", { layer: "duplicator#1", attr: "generator.count", value: 99 });
  assert.ok(!r.isError);
  assert.match(r.text, /"label": null/);
  assert.match(r.text, /No label anywhere/);
});

stallion.close();
await test("explains how to fix an unreachable Stallion", async () => { const r = await call("cavalry_execute_script", { code: "1" }); assert.ok(r.isError); assert.match(r.text, /Scripts > Stallion/); });

await client.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
