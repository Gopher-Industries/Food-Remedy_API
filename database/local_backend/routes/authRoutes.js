const express = require("express");

const {
  registerUser
} = require("../controllers/authController");

const router = express.Router();

// Register endpoint
router.post("/register", registerUser);

// Test error endpoint for TEST002 logging verification
// This route intentionally throws an error so error logging can be verified.
router.get("/test-error", (req, res, next) => {

  const error = new Error(
    "Simulated backend failure"
  );

  next(error);

});

module.exports = router;