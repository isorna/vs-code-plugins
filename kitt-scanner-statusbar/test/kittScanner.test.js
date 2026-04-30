"use strict";

const assert = require("assert");

const {
  DEFAULT_COLOR,
  DEFAULT_FRAME_DELAY,
  MAX_FRAME_DELAY,
  MIN_FRAME_DELAY,
  buildFrames,
  normalizeColor,
  normalizeFrameDelay
} = require("../src/kittScanner");
const {
  CONFIGURATION_TARGET,
  createExternalController,
  isEnabled,
  resolveConfigurationTarget
} = require("../src/externalControl");

function createConfigurationHarness(initialValue, inspectResult) {
  const state = {
    value: initialValue
  };
  const updates = [];

  return {
    configuration: {
      get(key, fallback) {
        assert.strictEqual(key, "enabled");
        return state.value === undefined ? fallback : state.value;
      },
      inspect(key) {
        assert.strictEqual(key, "enabled");
        return inspectResult;
      },
      async update(key, value, target) {
        assert.strictEqual(key, "enabled");
        state.value = value;
        updates.push({ value, target });
      }
    },
    getConfiguration(section) {
      assert.strictEqual(section, "kittScanner");
      return this.configuration;
    },
    state,
    updates
  };
}

async function run() {
  const frames = buildFrames();

  assert.ok(Array.isArray(frames));
  assert.ok(frames.length > 10);
  assert.strictEqual(frames[0], "[▓▒░░░░░░░]");
  assert.strictEqual(frames[frames.length - 1], "[█▓▒░░░░░░]");
  assert.ok(frames.every((frame) => frame.length === frames[0].length));
  assert.ok(frames.every((frame) => !frame.includes(" ")));

  assert.strictEqual(normalizeColor(), DEFAULT_COLOR);
  assert.strictEqual(normalizeColor("  #12abEF "), "#12abEF");
  assert.strictEqual(normalizeColor("red"), DEFAULT_COLOR);

  assert.strictEqual(normalizeFrameDelay(), DEFAULT_FRAME_DELAY);
  assert.strictEqual(normalizeFrameDelay("55"), 55);
  assert.strictEqual(normalizeFrameDelay(12), MIN_FRAME_DELAY);
  assert.strictEqual(normalizeFrameDelay(2400), MAX_FRAME_DELAY);

  const defaultHarness = createConfigurationHarness(undefined);
  assert.strictEqual(isEnabled(defaultHarness.getConfiguration.bind(defaultHarness)), true);

  const workspaceHarness = createConfigurationHarness(false, { workspaceValue: false });
  assert.strictEqual(isEnabled(workspaceHarness.getConfiguration.bind(workspaceHarness)), false);
  assert.strictEqual(
    resolveConfigurationTarget(workspaceHarness.configuration),
    CONFIGURATION_TARGET.Workspace
  );

  const workspaceFolderHarness = createConfigurationHarness(false, {
    workspaceFolderValue: false
  });
  assert.strictEqual(
    resolveConfigurationTarget(workspaceFolderHarness.configuration),
    CONFIGURATION_TARGET.WorkspaceFolder
  );

  const controller = createExternalController(
    workspaceHarness.getConfiguration.bind(workspaceHarness),
    () => {}
  );

  assert.strictEqual(await controller.enable(), true);
  assert.deepStrictEqual(workspaceHarness.updates[0], {
    value: true,
    target: CONFIGURATION_TARGET.Workspace
  });
  assert.strictEqual(controller.isEnabled(), true);

  assert.strictEqual(await controller.toggle(CONFIGURATION_TARGET.Global), false);
  assert.deepStrictEqual(workspaceHarness.updates[1], {
    value: false,
    target: CONFIGURATION_TARGET.Global
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
