const express = require("express");

const authRoutes =
  require("./routes/authRoutes");

const loggerMiddleware =
  require("./middleware/loggerMiddleware");

const errorLogger =
  require("./middleware/errorLogger");

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

// Request logger
app.use(loggerMiddleware);

// Routes
app.use("/api/auth", authRoutes);

// Error logger middleware
app.use(errorLogger);

// Server Port
const PORT = 3000;

// Start server
app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );

});