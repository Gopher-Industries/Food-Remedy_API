"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

function requireNonPlaceholder(value, label) {
  requireNonEmptyString(value, label);

  const normalized = value.trim().toLowerCase();

  const placeholderPatterns = [
    "placeholder",
    "changeme",
    "change-me",
    "example",
    "test-site-key",
    "test-secret",
    "your-site-key",
    "your-secret",
  ];

  if (placeholderPatterns.some((pattern) => normalized.includes(pattern))) {
    throw new Error(`${label} must not use a placeholder value.`);
  }
}

function requireAsset(filePath, label) {
  requireNonEmptyString(filePath, label);

  const resolvedPath = path.resolve(__dirname, "..", filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
}

function requireProductionUrl(value, label) {
  requireNonEmptyString(value, label);

  let parsedUrl;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS.`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  const localHosts = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "10.0.2.2",
  ];

  if (
    localHosts.includes(hostname) ||
    hostname.endsWith(".local")
  ) {
    throw new Error(
      `${label} must not use localhost or a local development address.`
    );
  }

  const normalized = value.toLowerCase();

  const placeholderPatterns = [
    "placeholder",
    "changeme",
    "change-me",
    "example.com",
    "your-api",
    "your-domain",
  ];

  if (placeholderPatterns.some((pattern) => normalized.includes(pattern))) {
    throw new Error(`${label} must not use a placeholder value.`);
  }
}

function requireProductionEnvironment() {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  const captchaEnabled = process.env.EXPO_PUBLIC_CAPTCHA_ENABLED;
  const captchaSiteKey = process.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY;
  const captchaSecret = process.env.HCAPTCHA_SECRET_KEY;

  requireProductionUrl(
    apiBaseUrl,
    "EXPO_PUBLIC_API_BASE_URL"
  );

  if (captchaEnabled !== "true") {
    throw new Error(
      "EXPO_PUBLIC_CAPTCHA_ENABLED must be true for a production build."
    );
  }

  requireNonPlaceholder(
    captchaSiteKey,
    "EXPO_PUBLIC_HCAPTCHA_SITE_KEY"
  );

  requireNonPlaceholder(
    captchaSecret,
    "HCAPTCHA_SECRET_KEY"
  );

  return {
    apiBaseUrl,
    captchaSiteKey,
  };
}

function validate() {
  const appConfig = readJson(
    path.resolve(__dirname, "..", "app.json")
  );

  const easConfig = readJson(
    path.resolve(__dirname, "..", "eas.json")
  );

  const expo = appConfig.expo;

  if (!expo || typeof expo !== "object") {
    throw new Error(
      "app.json must define an expo configuration object."
    );
  }

  requireNonEmptyString(expo.name, "expo.name");
  requireNonEmptyString(expo.slug, "expo.slug");
  requireNonEmptyString(expo.version, "expo.version");

  requireNonEmptyString(
    expo.android?.package,
    "expo.android.package"
  );

  if (
    !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,}$/.test(
      expo.android.package
    )
  ) {
    throw new Error(
      "expo.android.package must be a valid reverse-domain Android application id."
    );
  }

  requireAsset(
    expo.icon,
    "expo.icon"
  );

  requireAsset(
    expo.android?.adaptiveIcon?.foregroundImage,
    "expo.android.adaptiveIcon.foregroundImage"
  );

  requireAsset(
    expo.web?.favicon,
    "expo.web.favicon"
  );

  const splashPlugin = expo.plugins?.find(
    (plugin) =>
      Array.isArray(plugin) &&
      plugin[0] === "expo-splash-screen"
  );

  if (!splashPlugin) {
    throw new Error(
      "expo-splash-screen plugin configuration is required."
    );
  }

  requireAsset(
    splashPlugin[1]?.image,
    "expo-splash-screen image"
  );

  requireNonEmptyString(
    expo.extra?.eas?.projectId,
    "expo.extra.eas.projectId"
  );

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      expo.extra.eas.projectId
    )
  ) {
    throw new Error(
      "expo.extra.eas.projectId must be a UUID."
    );
  }

  requireNonEmptyString(
    easConfig.cli?.version,
    "eas.json cli.version"
  );

  if (easConfig.cli?.appVersionSource !== "remote") {
    throw new Error(
      "eas.json cli.appVersionSource must be set to remote."
    );
  }

  if (easConfig.build?.production?.autoIncrement !== true) {
    throw new Error(
      "eas.json build.production.autoIncrement must be true."
    );
  }

  const productionEnv = requireProductionEnvironment();

  const manifest = {
    easProfile: "production",
    apiBaseUrl: productionEnv.apiBaseUrl,
    firebaseProjectId: "foodremedy-deakin",
    firebaseStorageBucket: "foodremedy-deakin.firebasestorage.app",
    captchaSiteKey: productionEnv.captchaSiteKey,
    captchaVerificationEndpoint: "/verify-captcha",
    captchaEnabled: true,
  };

  const fingerprint = crypto
    .createHash("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex");

  console.log("Release configuration validation passed.");
  console.log(`Configuration fingerprint: ${fingerprint}`);
}

try {
  validate();
} catch (error) {
  console.error(
    `Release configuration validation failed: ${error.message}`
  );
  process.exitCode = 1;
}