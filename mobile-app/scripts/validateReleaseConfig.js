"use strict";

const fs = require("fs");
const path = require("path");

function readJson(fileName) {
  try {
    return JSON.parse(fs.readFileSync(fileName, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${fileName}: ${error.message}`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function requireAsset(filePath, label) {
  requireNonEmptyString(filePath, label);

  const resolvedPath = path.resolve(__dirname, "..", filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
}

function validate() {
  const appConfig = readJson(path.resolve(__dirname, "..", "app.json"));
  const easConfig = readJson(path.resolve(__dirname, "..", "eas.json"));
  const expo = appConfig.expo;

  if (!expo || typeof expo !== "object") {
    throw new Error("app.json must define an expo configuration object.");
  }

  requireNonEmptyString(expo.name, "expo.name");
  requireNonEmptyString(expo.slug, "expo.slug");
  requireNonEmptyString(expo.version, "expo.version");
  requireNonEmptyString(expo.android?.package, "expo.android.package");

  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,}$/.test(expo.android.package)) {
    throw new Error("expo.android.package must be a valid reverse-domain Android application id.");
  }

  requireAsset(expo.icon, "expo.icon");
  requireAsset(expo.android?.adaptiveIcon?.foregroundImage, "expo.android.adaptiveIcon.foregroundImage");
  requireAsset(expo.web?.favicon, "expo.web.favicon");

  const splashPlugin = expo.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen"
  );
  if (!splashPlugin) {
    throw new Error("expo-splash-screen plugin configuration is required.");
  }
  requireAsset(splashPlugin[1]?.image, "expo-splash-screen image");

  requireNonEmptyString(expo.extra?.eas?.projectId, "expo.extra.eas.projectId");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expo.extra.eas.projectId)) {
    throw new Error("expo.extra.eas.projectId must be a UUID.");
  }

  requireNonEmptyString(easConfig.cli?.version, "eas.json cli.version");
  if (easConfig.cli?.appVersionSource !== "remote") {
    throw new Error("eas.json cli.appVersionSource must be set to remote.");
  }
  if (easConfig.build?.production?.autoIncrement !== true) {
    throw new Error("eas.json build.production.autoIncrement must be true.");
  }
}

try {
  validate();
  console.log("Release configuration validation passed.");
} catch (error) {
  console.error(`Release configuration validation failed: ${error.message}`);
  process.exitCode = 1;
}
