const express = require("express");

const authRoutes = require("./routes/authRoutes");
const { createSubstitutionRouter } = require("./routes/substitutionRoutes");

function createApp(options = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use(express.urlencoded({ extended: true, limit: "16kb" }));
  app.use("/api/auth", authRoutes);
  app.use("/api/v1/scan/substitutions", createSubstitutionRouter(options.substitutions));
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, () => console.log(`Server running on port ${port}`));
}

module.exports = { createApp };
