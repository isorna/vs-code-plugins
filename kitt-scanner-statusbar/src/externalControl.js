"use strict";

const CONFIGURATION_TARGET = Object.freeze({
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3
});

const CONFIGURATION_SECTION = "kittScanner";
const ENABLED_SETTING = "enabled";

function getScannerConfiguration(getConfiguration) {
  return getConfiguration(CONFIGURATION_SECTION);
}

function isEnabled(getConfiguration) {
  return Boolean(getScannerConfiguration(getConfiguration).get(ENABLED_SETTING, true));
}

function resolveConfigurationTarget(configuration, requestedTarget) {
  if (requestedTarget !== undefined && requestedTarget !== null) {
    return requestedTarget;
  }

  if (typeof configuration.inspect !== "function") {
    return CONFIGURATION_TARGET.Global;
  }

  const inspected = configuration.inspect(ENABLED_SETTING);
  if (inspected && inspected.workspaceFolderValue !== undefined) {
    return CONFIGURATION_TARGET.WorkspaceFolder;
  }

  if (inspected && inspected.workspaceValue !== undefined) {
    return CONFIGURATION_TARGET.Workspace;
  }

  return CONFIGURATION_TARGET.Global;
}

async function setEnabled(getConfiguration, enabled, target) {
  const configuration = getScannerConfiguration(getConfiguration);
  const configurationTarget = resolveConfigurationTarget(configuration, target);
  await configuration.update(ENABLED_SETTING, enabled, configurationTarget);
  return enabled;
}

async function toggleEnabled(getConfiguration, target) {
  return setEnabled(getConfiguration, !isEnabled(getConfiguration), target);
}

function createExternalController(getConfiguration, refresh) {
  return {
    async enable(target) {
      return setEnabled(getConfiguration, true, target);
    },
    async disable(target) {
      return setEnabled(getConfiguration, false, target);
    },
    async toggle(target) {
      return toggleEnabled(getConfiguration, target);
    },
    isEnabled() {
      return isEnabled(getConfiguration);
    },
    refresh() {
      refresh();
    }
  };
}

module.exports = {
  CONFIGURATION_SECTION,
  CONFIGURATION_TARGET,
  ENABLED_SETTING,
  createExternalController,
  isEnabled,
  resolveConfigurationTarget,
  setEnabled,
  toggleEnabled
};
