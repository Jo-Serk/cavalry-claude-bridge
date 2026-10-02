// JavaScript snippets that are sent to Cavalry through Stallion. Each one was run against a live scene.

export const SAFE = `function safe(fn, d) { try { var v = fn(); return v === undefined ? d : v; } catch (e) { return d; } }`;

export const SCENE_JS = `
(function () {
  ${SAFE}
  var comp = safe(function () { return api.getActiveComp(); }, null);
  var ids = safe(function () { return api.getAllSceneLayers(); }, []);
  var layers = ids.map(function (id) {
    var L = {
      id: id,
      name: safe(function () { return api.getNiceName(id); }, null),
      type: safe(function () { return api.getLayerType(id); }, null)
    };
    var parent = safe(function () { return api.getParent(id); }, "");
    if (parent) L.parent = parent;
    var children = safe(function () { return api.getChildren(id); }, []);
    if (children.length) L.children = children;
    var attrs = {}, expr = {}, animated = [];
    safe(function () { return api.getAttributes(id); }, []).forEach(function (a) {
      if (safe(function () { return api.hasAttributeExpression(id, a); }, false)) {
        expr[a] = safe(function () { return api.getAttributeExpression(id, a); }, "");
      }
      if (safe(function () { return api.isAnimatedAttribute(id, a); }, false)) animated.push(a);
      if (!safe(function () { return api.isAttrDefault(id, a); }, true)) {
        var v = safe(function () { return api.get(id, a); }, null);
        if (v !== null) attrs[a] = v;
      }
    });
    if (Object.keys(attrs).length) L.nonDefault = attrs;
    if (Object.keys(expr).length) L.expressions = expr;
    if (animated.length) L.animated = animated;
    var cin = {}, cout = {};
    safe(function () { return api.getInConnectedAttributes(id); }, []).forEach(function (a) {
      cin[a] = safe(function () { return api.getInConnection(id, a); }, null);
    });
    safe(function () { return api.getOutConnectedAttributes(id); }, []).forEach(function (a) {
      cout[a] = safe(function () { return api.getOutConnections(id, a); }, null);
    });
    if (Object.keys(cin).length) L.connectionsIn = cin;
    if (Object.keys(cout).length) L.connectionsOut = cout;
    return L;
  });
  return {
    comp: comp ? { id: comp, name: safe(function () { return api.getNiceName(comp); }, null) } : null,
    frame: safe(function () { return api.getFrame(); }, null),
    selection: safe(function () { return api.getSelection(); }, []),
    layers: layers
  };
})();
`;

export function apiSearchJs(pattern: string) {
  return `
  (function () {
    var re = new RegExp(${JSON.stringify(pattern)}, "i");
    var fns = [];
    for (var k in api) { if (re.test(k)) fns.push(k + " (" + typeof api[k] + ")"); }
    var types = [];
    try {
      api.getAllLayerTypes(true).forEach(function (t) {
        if (re.test(t.type) || re.test(t.name)) types.push(t.type + " = " + t.name);
      });
    } catch (e) {}
    return { functions: fns.sort(), layerTypes: types };
  })();
  `;
}

export function connectJs(p: { from: string; fromAttr: string; to: string; toAttr: string; replace: boolean }) {
  return `
(function () {
  var P = ${JSON.stringify(p)};
  if (!api.layerExists(P.from)) throw "cavalry_connect: source node not found: " + P.from;
  if (!api.layerExists(P.to)) throw "cavalry_connect: target node not found: " + P.to;
  // Create the array slot first (e.g. shapes.0, behaviour.1.id): connect() fails silently without it.
  var parts = P.toAttr.split(".");
  var addedSlots = 0;
  for (var i = 1; i < parts.length; i++) {
    if (String(parseInt(parts[i], 10)) === parts[i]) {
      var arrAttr = parts.slice(0, i).join(".");
      var idx = parseInt(parts[i], 10);
      var guard = 0;
      while (api.getArrayCount(P.to, arrAttr) <= idx && guard < 256) { api.addArrayIndex(P.to, arrAttr); addedSlots++; guard++; }
      if (api.getArrayCount(P.to, arrAttr) <= idx) throw "cavalry_connect: could not create array slot " + arrAttr + "." + idx;
      break;
    }
  }
  var want = P.from + "." + P.fromAttr;
  var prev = api.getInConnection(P.to, P.toAttr);
  if (prev === want) return { ok: true, note: "already connected", connection: want + " -> " + P.to + "." + P.toAttr };
  if (prev) {
    if (!P.replace) throw "cavalry_connect: input " + P.to + "." + P.toAttr + " is already connected to " + prev + " (pass replace: true to replace it)";
    api.disconnectInput(P.to, P.toAttr);
  }
  api.connect(P.from, P.fromAttr, P.to, P.toAttr);
  var now = api.getInConnection(P.to, P.toAttr);
  if (now !== want) throw "cavalry_connect: connect() raised no error but the connection was not created (input is now: " + JSON.stringify(now) + "). Check attribute names and types.";
  return { ok: true, connection: want + " -> " + P.to + "." + P.toAttr, replaced: prev || null, addedSlots: addedSlots };
})();
`;
}

export function setDistributionJs(p: { layer: string; type: string }) {
  return `
(function () {
  var P = ${JSON.stringify(p)};
  var KNOWN = ["array", "circle", "custom", "fibonacci", "grid", "linear", "mask", "math", "particle", "path", "point", "random", "rose", "shuffle", "sort", "transform", "voxelize"];
  if (!api.layerExists(P.layer)) throw "cavalry_set_distribution: layer not found: " + P.layer;
  var lt = api.getLayerType(P.layer);
  if (lt !== "duplicator" && lt !== "strokeDuplicator") throw "cavalry_set_distribution: " + P.layer + " is a '" + lt + "', not a duplicator";
  var t = /Distribution$/.test(P.type) ? P.type : P.type + "Distribution";
  var before = api.getCurrentGeneratorType(P.layer, "generator");
  api.setGenerator(P.layer, "generator", t);
  var after = api.getCurrentGeneratorType(P.layer, "generator");
  if (after !== t) throw "cavalry_set_distribution: type '" + t + "' was not applied (unknown names are silently ignored; the generator is still '" + after + "'). Confirmed types: " + KNOWN.join(", ");
  var vals = {};
  api.getAttributes(P.layer).filter(function (a) { return a.indexOf("generator.") === 0; }).forEach(function (a) {
    try { vals[a.substring(10)] = api.get(P.layer, a); } catch (e) {}
  });
  return { ok: true, before: before, after: after, node: api.getCurrentGenerator(P.layer, "generator"), attributes: vals };
})();
`;
}

export function buildWrapper(code: string, outFile: string): string {
  return `
  (function () {
    var __env = { ok: true, noResult: false, result: null, logs: [], error: null };
    var __orig = {};
    ["log", "warn", "error", "info"].forEach(function (k) {
      if (typeof console !== "undefined" && typeof console[k] === "function") {
        __orig[k] = console[k];
        console[k] = function () {
          var parts = [];
          for (var i = 0; i < arguments.length; i++) {
            var a = arguments[i];
            if (typeof a === "string") { parts.push(a); }
            else { try { parts.push(JSON.stringify(a)); } catch (e) { parts.push(String(a)); } }
          }
          __env.logs.push((k === "log" ? "" : k + ": ") + parts.join(" "));
        };
      }
    });
    try {
      var __r = eval(${JSON.stringify(code)});
      if (__r === undefined) { __env.noResult = true; }
      else {
        try { JSON.stringify(__r); __env.result = __r; }
        catch (e) { __env.result = String(__r); }
      }
    } catch (e) {
      __env.ok = false;
      __env.error = (e && e.message) ? String(e.message) : String(e);
      if (e && e.stack) { __env.error += "\\n" + String(e.stack); }
    }
    Object.keys(__orig).forEach(function (k) { console[k] = __orig[k]; });
    var __text;
    try { __text = JSON.stringify(__env); }
    catch (e) { __text = JSON.stringify({ ok: false, noResult: true, result: null, logs: [], error: "Could not serialize: " + String(e) }); }
    
    try {
      if (typeof api.writeToFile === 'function') {
        api.writeToFile(${JSON.stringify(outFile)}, __text);
      }
    } catch(e) {}
  })();
  `;
}

export function getKeyframesJs(layerId: string, attr: string): string {
  return `
(function () {
  var LAYER = ${JSON.stringify(layerId)}, ATTR = ${JSON.stringify(attr)};
  if (!api.hasAttribute(LAYER, ATTR)) throw "cavalry_get_keyframes: attribute not found: " + LAYER + "." + ATTR + " (use the exact leaf path, e.g. position.x, not the compound name)";
  var ids = api.getKeyframeIdsForAttribute(LAYER, ATTR) || [];
  var times = api.getKeyframeTimes(LAYER, ATTR) || [];
  if (!ids.length) return { animated: false, keyframes: [] };
  var originalFrame = api.getFrame();
  var keyframes = times.map(function (t, i) {
    api.setFrame(t);
    return { id: ids[i], time: t, value: api.get(LAYER, ATTR) };
  });
  api.setFrame(originalFrame);
  return { animated: true, keyframes: keyframes };
})();
`;
}

export function parentJs(childId: string, targetId: string | null): string {
  return `
(function () {
  var CHILD = ${JSON.stringify(childId)}, TARGET = ${JSON.stringify(targetId)};
  if (!api.layerExists(CHILD)) throw "cavalry_parent: child not found: " + CHILD;
  if (TARGET === null) {
    api.unParent(CHILD);
    return { ok: true, parent: api.getParent(CHILD) || null };
  }
  if (!api.layerExists(TARGET)) throw "cavalry_parent: target not found: " + TARGET;
  api.parent(CHILD, TARGET);
  var now = api.getParent(CHILD);
  if (now !== TARGET) throw "cavalry_parent: parent() raised no error but the hierarchy was not updated (parent is now: " + JSON.stringify(now) + ").";
  return { ok: true, parent: now };
})();
`;
}

export function lookupEnumJs(layerId: string, attr: string, value: number, db: any): string {
  // Everything happens in ONE round trip: the static DB (embedded as a literal) is checked first;
  // a layer-type key is resolved at runtime (a generator sub-type for "generator.*" attributes,
  // since that's how direction/distributionMode/mode actually diverge - see knowledge/api-notes.md
  // "duplicator" and the enum-investigation session notes); only on a DB miss does it fall back
  // to a real getDropdownNiceName call against the actual layer.
  return `
(function () {
  var LAYER = ${JSON.stringify(layerId)}, ATTR = ${JSON.stringify(attr)}, VALUE = ${JSON.stringify(value)};
  var DB = ${JSON.stringify(db)};
  if (!api.hasAttribute(LAYER, ATTR)) throw "cavalry_lookup_enum: attribute not found: " + LAYER + "." + ATTR;

  var typeKey = "";
  try {
    typeKey = ATTR.indexOf("generator.") === 0 ? api.getCurrentGeneratorType(LAYER, "generator") : api.getLayerType(LAYER);
  } catch (e) { try { typeKey = api.getLayerType(LAYER); } catch (e2) {} }

  function fromDb() {
    var div = DB.divergent && DB.divergent[ATTR];
    if (div) {
      for (var key in div) {
        if (key.indexOf("_") === 0) continue;
        if (key.split("/").indexOf(typeKey) !== -1) {
          var label = div[key][String(VALUE)];
          return label !== undefined ? (label || null) : null;
        }
      }
    }
    var uni = DB.universal && DB.universal[ATTR];
    if (uni) {
      var label2 = uni[String(VALUE)];
      return label2 !== undefined ? (label2 || null) : null;
    }
    return null;
  }

  var cached = fromDb();
  if (cached !== null) return { source: "static-db", typeKey: typeKey, label: cached };

  var live = "";
  try { live = api.getDropdownNiceName(LAYER, ATTR, VALUE); } catch (e) { live = ""; }
  return {
    source: "live",
    typeKey: typeKey,
    label: live || null,
    note: live ? null : "No label anywhere - getAttrType may be 'int' rather than 'enum' (Cavalry has no name table at all for it, e.g. masks.N.mode), or it's an 'enum' rendered as icon buttons with no registered names (e.g. Duplicator Grid's Direction). Ask the user to confirm it by toggling in the UI."
  };
})();
`;
}
