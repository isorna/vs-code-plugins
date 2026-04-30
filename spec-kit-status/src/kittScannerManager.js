"use strict";

const KITT_SCANNER_EXTENSION_IDS = Object.freeze([
  "local.kitt-scanner-statusbar"
]);
const KITT_SCANNER_PACKAGE_NAME = "kitt-scanner-statusbar";

function resolveKittScannerExtension(extensionsApi) {
  for (const extensionId of KITT_SCANNER_EXTENSION_IDS) {
    const extension = extensionsApi.getExtension(extensionId);
    if (extension) {
      return extension;
    }
  }

  return extensionsApi.all.find((extension) => {
    return extension?.packageJSON?.name === KITT_SCANNER_PACKAGE_NAME;
  }) ?? null;
}

class KittScannerManager {
  constructor(options) {
    this.extensionsApi = options.extensionsApi;
    this.configurationTarget = options.configurationTarget;
    this.onError = options.onError ?? (() => {});
    this.controller = null;
    this.ownsScannerSession = false;
    this.activityCount = 0;
  }

  async runTask(task) {
    await this.beginActivity();
    try {
      return await task();
    } finally {
      await this.endActivity();
    }
  }

  async beginActivity() {
    this.activityCount += 1;
    if (this.activityCount > 1) {
      return;
    }

    await this.enable();
  }

  async endActivity() {
    if (this.activityCount === 0) {
      return;
    }

    this.activityCount -= 1;
    if (this.activityCount > 0) {
      return;
    }

    await this.disable();
  }

  async dispose() {
    this.activityCount = 0;
    await this.disable();
  }

  async enable() {
    const controller = await this.getController();
    if (!controller) {
      return;
    }

    if (controller.isEnabled()) {
      this.ownsScannerSession = false;
      return;
    }

    try {
      await controller.enable(this.configurationTarget);
      this.ownsScannerSession = true;
    } catch (error) {
      this.ownsScannerSession = false;
      this.onError(error);
    }
  }

  async disable() {
    if (!this.ownsScannerSession) {
      return;
    }

    const controller = await this.getController();
    if (!controller) {
      this.ownsScannerSession = false;
      return;
    }

    try {
      await controller.disable(this.configurationTarget);
    } catch (error) {
      this.onError(error);
    } finally {
      this.ownsScannerSession = false;
    }
  }

  async getController() {
    if (this.controller) {
      return this.controller;
    }

    const extension = resolveKittScannerExtension(this.extensionsApi);
    if (!extension) {
      return null;
    }

    try {
      const controller = extension.isActive ? extension.exports : await extension.activate();
      if (!isValidController(controller)) {
        return null;
      }
      this.controller = controller;
      return controller;
    } catch (error) {
      this.onError(error);
      return null;
    }
  }
}

function isValidController(controller) {
  return Boolean(
    controller &&
    typeof controller.enable === "function" &&
    typeof controller.disable === "function" &&
    typeof controller.isEnabled === "function"
  );
}

module.exports = {
  KittScannerManager,
  resolveKittScannerExtension
};
