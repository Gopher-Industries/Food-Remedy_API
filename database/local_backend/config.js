require("dotenv").config();

function getEnv(name, fallback = undefined) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value;
}

function getNumberEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number`);
  }

  return parsed;
}

const config = {
  env: getEnv("NODE_ENV", "development"),

  database: {
    sqliteFileName: getEnv("SQLITE_DB_FILE", "local_cache.db")
  },

  pipeline: {
    version: getEnv("PIPELINE_VERSION", "1.3.0"),
    sugarHighLimit: getNumberEnv("SUGAR_HIGH_LIMIT", 20)
  }
};

module.exports = config;