const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const ROOT_DIR = process.cwd();
const NODE_ENV = process.env.NODE_ENV || "development";

const envFilesInOrder = [
  `.env.${NODE_ENV}.local`,
  `.env.local`,
  `.env.${NODE_ENV}`,
  `.env`
];

for (const file of envFilesInOrder) {
  const fullPath = path.resolve(ROOT_DIR, file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath });
  }
}

function requireEnv(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;

  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getEnv(name, fallback = "") {
  return process.env[name] ?? fallback;
}

function getNumberEnv(name, fallback) {
  const value = process.env[name];

  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }

  return parsed;
}

function getBooleanEnv(name, fallback = false) {
  const value = process.env[name];

  if (value === undefined || value === "") {
    return fallback;
  }

  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

const config = {
  env: NODE_ENV,
  isDevelopment: NODE_ENV === "development",
  isProduction: NODE_ENV === "production",

  app: {
    name: getEnv("APP_NAME", "Food Remedy API"),
    port: getNumberEnv("PORT", 3000),
    apiBaseUrl: getEnv("API_BASE_URL", "http://localhost:3000"),
    frontendUrl: getEnv("FRONTEND_URL", "http://localhost:8081")
  },

  security: {
    jwtSecret: requireEnv("JWT_SECRET"),
    sessionSecret: requireEnv("SESSION_SECRET"),
    bcryptSaltRounds: getNumberEnv("BCRYPT_SALT_ROUNDS", 10)
  },

  database: {
    sqlitePath: getEnv("SQLITE_DB_PATH", "./database/local.db"),
    firebaseProjectId: requireEnv("FIREBASE_PROJECT_ID"),
    firebaseClientEmail: requireEnv("FIREBASE_CLIENT_EMAIL"),
    firebasePrivateKey: requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n")
  },

  cors: {
    allowedOrigins: getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:8081")
      .split(",")
      .map(origin => origin.trim())
      .filter(Boolean)
  },

  logging: {
    level: getEnv("LOG_LEVEL", NODE_ENV === "production" ? "info" : "debug")
  },

  features: {
    enableSwagger: getBooleanEnv("ENABLE_SWAGGER", NODE_ENV !== "production"),
    enableVerboseErrors: getBooleanEnv("ENABLE_VERBOSE_ERRORS", NODE_ENV !== "production"),
    enableRecommendationCache: getBooleanEnv("ENABLE_RECOMMENDATION_CACHE", true)
  }
};

module.exports = config;