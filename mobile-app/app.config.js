const { expo } = require("./app.json");

module.exports = {
  ...expo,
  extra: {
    ...expo.extra,
    appVariant: process.env.APP_VARIANT ?? "development",
  },
};
