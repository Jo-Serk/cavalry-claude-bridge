# Cavalry API notes

Verified on a live scene through Stallion. Split by "## " headings into topics for the cavalry_help tool.

## workflow
- Start with cavalry_get_scene: hierarchy, non-default attributes, expressions, animation and connections. The user may have changed the scene by hand since you last looked.
- Edit in small steps. Prefer cavalry_connect and cavalry_set_distribution over raw scripts for those jobs.
- After editing, call cavalry_get_scene again and cavalry_render_frame to check the result visually.
- Before deleting layers or making bulk changes nobody asked for, warn the user and ask them to save the scene: scripts run immediately.
- Delete temporary nodes you created for testing and restore the scene.

## gotchas
- API errors are thrown as plain strings, not Error objects.
- The value of the LAST expression is returned; wrap code in (function(){ ... return x; })(); to use return. console.log output is captured.
- api.connect() fails SILENTLY when the array slot does not exist or the input is already taken. Use cavalry_connect, or verify with api.getInConnection.
- api.setGenerator() silently ignores unknown type names. Verify with api.getCurrentGeneratorType (cavalry_set_distribution does this).
- After deleting a driver node (Random and so on) the attribute keeps its last driven value. Reset it with api.set and check api.isAttrDefault.
- getAttributeDefinition(...).enumValues can be incomplete or empty; do not trust it for value labels.
- api.renderPNGFrame(path, scale) takes a PERCENT (100 = full size). 0.5 produces a tiny image.
- api.getBoundingBox needs two arguments (id, worldSpace).
- These functions do not exist: getLayerIds, getLayerName, getNodeType, writeTextFile, print.

## layers
- api.getAllSceneLayers() (no arguments) returns every node, including compNode#1 and utility nodes (random, value2Array, ...). api.getCompLayers(x) takes one argument and returns the composition's layers.
- getNiceName(id), getLayerType(id), getParent(id), getChildren(id), getActiveComp(), getFrame(), getSelection().
- api.create("type", "Name") returns the new id. api.getAllLayerTypes(true) returns [{name, type}] (for example duplicator, random, value2Array, basicShape). api.deleteLayer(id), api.layerExists(id).

## attributes
- getAttributes(id), get(id, attr), set(id, { attr: value }), isAttrDefault, getAttrType, getAttributeDefinition (type, default, numericInfo with hardMin/softMin/softMax/step, enumValues).
- Vectors are {x, y} or {x, y, z}; colours are {r, g, b, a} in 0-255.
- Arrays: addArrayIndex(id, "shapes"), getArrayCount, getAttrChildren. Elements are named shapes.0, shapes.1, ...
- getBoundingBox(id, true) gives world-space extents, handy for checking layouts with numbers. Positions of individual duplicator clones are not exposed; render the frame instead.

## connections
- Read: getInConnectedAttributes(id), getInConnection(id, attr) (returns "node.attr"), getOutConnectedAttributes(id), getOutConnections(id, attr) (returns an array).
- Write: api.connect(fromId, "id", toId, attr) and api.disconnectInput(id, attr).
- An attribute has exactly one input. Behaviour Mixer slots are compound (behaviour.N.id) and did not accept a value2Array.
- cavalry_connect does all of this and verifies the result.

## duplicator
- Source shape: shape.id -> duplicator.shapes.0 (create the slot first).
- Per-clone attributes: shapePosition, shapeRotation, shapeScale, shapeSkew, shapeOpacity, ...
- A random node (minimum, maximum, seed, strength, separateChannels, useIndex, offset) connects as random.id -> duplicator.shapePosition. separateChannels: true gives independent X and Y jitter.
- The distribution is a separate generator node: api.setGenerator(dup, "generator", "circleDistribution"); read it with getCurrentGeneratorType(dup, "generator") and getCurrentGenerator(dup, "generator"). The legacy generator.distributionMode attribute is not reliable. Use cavalry_set_distribution.
- Confirmed types (name + "Distribution"): array, circle, custom, fibonacci, grid, linear, mask, math, particle, path, point, random, rose, shuffle, sort, transform, voxelize. Intersections, Shape Edges, Shape Points and Sub-Mesh did not match that pattern.
- Attributes are rebuilt with defaults when the type changes. circle: angle, count (3), flip, includeEnd, radius (200), startAngle, travel, useIndex, calculateRotations. fibonacci: angle (360), count (50), radius (250). grid: count, direction, offset, size. linear: count, direction, size.

## render
- api.renderPNGFrame(path, percent) is synchronous. Helpers: getTempFolder(), filePathExists, deleteFilePath, writeToFile, readFromFile.
- cavalry_render_frame returns the current frame of the active composition as an image (not the editor viewport). The default 50% gives 960x540 for a 1080p composition.

## keyframes
- getKeyframeIdsForAttribute(layer, attr) and getKeyframeTimes(layer, attr) need the exact LEAF path (e.g. "position.x"), not a compound name ("position"); the compound returns empty even when isAnimatedAttribute(layer, "position") is true.
- There is no getter for a keyframe's value by id. To read it: save api.getFrame(), api.setFrame(time), api.get(layer, attr), then restore the original frame. A keyframe object itself (e.g. "keyframe#27") only exposes "id" via getAttributes - no value/tangent/interpolation getters exist on it.
- Writing works "blind" (no getter to confirm prior state): modifyKeyframeTangent(id, {x,y}), magicEasing(layer, attr, frame, "BounceOut") (exactly 4 args), flipGraph(layer, attr, "vertical") (exactly 3 args).
- Animating material.materialColor via two api.keyframe() calls with different {r,g,b,a} did NOT register as animated at all (isAnimatedAttribute false, empty id/time lists). Root cause not found; numeric attributes like position.x work fine.
- cavalry_get_keyframes requires an explicit attribute path for these reasons - it does not try to auto-discover animated attributes.

## hierarchy
- api.parent(childId, targetId) / api.unParent(childId) is a SEPARATE operation from api.connect() - it changes the parent/child tree, not an attribute connection. cavalry_connect does not touch this.
- Parenting genuinely cascades transforms: parenting a shape to a Null and moving the Null changes the shape's world-space bounding box (api.getBoundingBox(id, true)) by the same offset, while the shape's own local "position" stays unchanged. Confirmed numerically.
- One unexplained flake: a bbox read once failed to reflect a parent move immediately after parenting+moving in the same script; a clean re-run worked correctly. Not reproduced on purpose; keep in mind if a bbox check right after parenting looks stale.

## compositions-and-assets
- api.getAllSceneLayers() returns every layer across the WHOLE project (every composition's tree plus imported assets) in one flat list, not just the active composition (api.getActiveComp()). Confirmed on a project with 2 compositions, a pre-comp and an imported image: all of it showed up in one call.
- api.getComps() lists every composition's id in the project (not just the active one).
- api.create("compNode", ...) silently returns "" - compositions cannot be created by script, only from the UI (same silent-failure pattern as footageShape/compositionReference in the enum harvest).
- A "Pre-Comp" layer (type compositionReference) does not expose which composition it points to via any attribute or connection (checked all ~40 attributes and getInConnectedAttributes - empty). The only way to resolve it: api.getCompFromReference(precompLayerId) -> composition id. Matching by name is not reliable (names can collide).

## web-apis
- Scripts run through Stallion (so also through cavalry_execute_script) can do real outbound networking: `new api.WebClient(baseUrl)` + `.get(path)` / `.post(path, body, contentType)` / `.addHeader(name, value)` / `.status()` / `.body()`. Confirmed with a live GET and POST to httpbin.org. User-Agent reveals it is built on cpp-httplib.
- These calls are BLOCKING per Cavalry's own docs - a slow remote endpoint blocks the whole script (and can exceed our runScript timeout; seen with a slow third-party API while a fast one worked fine).
- api.openURL(url) exists and (per Cavalry's docs) accepts file:// paths, not just http(s) - it can open a local file/folder in the OS, not just a browser tab.
- api.WebServer exists - Cavalry can run its own HTTP server from a script (the same mechanism Stallion itself uses).
- Security implication for anyone driving this bridge: cavalry_execute_script is not limited to scene edits - it can make network requests, open arbitrary URLs/local paths, and open a listening server, all from the user's machine. Document this explicitly wherever the "Claude can run any JavaScript" warning lives.

## script-ui
- The `ui` namespace (Button, Container, Label, DropDown, etc.) IS available even through Stallion/cavalry_execute_script, not only in saved UI Script files.
- cavalry_api_search only searches the `api` object - it cannot find anything under `ui` (confirmed: searching "close" found nothing relevant because ui.close does not exist, and the search never looks at `ui` at all). Use a direct `for (var k in ui)` script instead when exploring the ui/widget surface.
- ui.show() renders INSIDE Stallion's own panel (appended after its "Listening on ..." text), not as a separate floating window.
- There is no ui.close()/ui.hide()/ui.clear() at the top level. Individual widgets have setHidden(bool), but each cavalry_execute_script call is a fresh, isolated evaluation - a widget reference created in one call cannot be reached again from a later call, so nothing can be hidden/removed after the fact from a new script. The practical way to clear a stuck panel is to restart Stallion itself.

## dynamic-script-nodes
Applies to javaScript (JS Utility), and very likely javaScriptModifier/javaScriptDeformer/javaScriptShape/javaScriptEmitter (same "dynamic" attribute family, not individually re-verified).
- A fresh node has one input already: displayed as "n0" in the UI, but its real scripting path is "array.0" (attribute `array` is type "dynamic"; getAttributeNiceName(id, "array.0") -> "n0"). The actual code lives in the `expression` attribute, pre-filled with an isPrime() example that calls n0.
- api.addDynamic(layerId, "array", typeString) adds a new input - the 3rd argument is the TYPE ("double", "string", "color", ...), NOT a name. New ones default to "n1", "n2", ... in the same way.
- api.renameAttribute(layerId, "array.0", "NewName") renames the attribute's display name only.
- CONFIRMED BUG/GOTCHA: renaming via renameAttribute does NOT update the `expression` code string. After renaming "n0" to "TargetPositionX", `api.get(id, "expression")` still literally contains `isPrime(n0)` - Cavalry never syncs the two. Any rename must be followed by manually rewriting `expression` to match, or the script breaks / silently uses a stale reference.
- api.rename(layerId, newName) is a DIFFERENT function - it renames the LAYER itself, not an attribute. Do not confuse it with renameAttribute.
- Practical workflow to avoid names drifting: write your own `expression` (or at least clear the boilerplate) before or immediately alongside renaming each array.N, and always keep the variable names inside `expression` in sync with whatever renameAttribute set - Cavalry will not do this for you.

## text-formatting
- Alignment (horizontalAlignment/verticalAlignment) never moves the pivot - api.get(id, "pivot") stayed {0,0} across every combination tested. Alignment only repositions the text within its box.
- Text Box Size's effect on alignment depends on autoWidth/autoHeight: when a dimension is auto, the box always equals the text's own size on that axis, so alignment has little visible effect on it; when that dimension is off (a fixed Text Box Size), alignment moves the text by a much larger amount within the fixed box. Confirmed numerically (bounding-box centre shift of ~70px with autoWidth vs ~330px with a fixed 400-wide box, switching to Right alignment on the same text).
- Field-reported rendering bug (not independently reproduced here, confirmed by the user's own testing): with per-line/per-character font-size overrides and a non-auto Text Box Size, the last couple of characters of a line can render oversized or as "?" glyphs. Workaround: add a trailing space at the end of each line (before the paragraph break, or at the very end).
