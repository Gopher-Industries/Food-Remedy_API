const express = require("express");

const authRoutes = require("./routes/authRoutes");

const app = express();

// Middleware MUST come before routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});