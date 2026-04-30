"use strict";

const DEFAULT_COLOR = "#FF0000";
const DEFAULT_FRAME_DELAY = 100;
const MIN_FRAME_DELAY = 40;
const MAX_FRAME_DELAY = 1000;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FRAMES = Object.freeze([
  "[▓▒░░░░░░░]",
  "[█▓▒░░░░░░]",
  "[▒█▓▒░░░░░]",
  "[░▒█▓▒░░░░]",
  "[░░▒█▓▒░░░]",
  "[░░░▒█▓▒░░]",
  "[░░░░▒█▓▒░]",
  "[░░░░░▒█▓▒]",
  "[░░░░░░▒█▓]",
  "[░░░░░░░▒█]",
  "[░░░░░░▒█▓]",
  "[░░░░░▒█▓▒]",
  "[░░░░▒█▓▒░]",
  "[░░░▒█▓▒░░]",
  "[░░▒█▓▒░░░]",
  "[░▒█▓▒░░░░]",
  "[▒█▓▒░░░░░]",
  "[█▓▒░░░░░░]"
]);

function buildFrames() {
  return FRAMES.slice();
}

function normalizeColor(value) {
  if (typeof value !== "string") {
    return DEFAULT_COLOR;
  }

  const trimmed = value.trim();
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : DEFAULT_COLOR;
}

function normalizeFrameDelay(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_FRAME_DELAY;
  }

  const rounded = Math.round(parsed);
  return Math.max(MIN_FRAME_DELAY, Math.min(MAX_FRAME_DELAY, rounded));
}

module.exports = {
  DEFAULT_COLOR,
  DEFAULT_FRAME_DELAY,
  MAX_FRAME_DELAY,
  MIN_FRAME_DELAY,
  buildFrames,
  normalizeColor,
  normalizeFrameDelay
};
