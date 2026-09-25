const {
  validateRegisterInput
} = require("../validators/authValidator");

const {
  successResponse,
  errorResponse
} = require("../utils/responseFormatter");

// Temporary in-memory users array
// Replace with Firebase/SQLite later if needed
const users = [];

const registerUser = async (req, res) => {
  try {

    const {
      name,
      email,
      password
    } = req.body;

    // Validation
    const validationErrors =
      validateRegisterInput({
        name,
        email,
        password
      });

    if (validationErrors.length > 0) {
      return res.status(400).json(
        errorResponse(
          "Validation failed",
          validationErrors
        )
      );
    }

    // Duplicate email check
    const existingUser = users.find(
      user =>
        user.email.toLowerCase() ===
        email.toLowerCase()
    );

    if (existingUser) {
      return res.status(409).json(
        errorResponse(
          "Email already exists",
          [
            "A user with this email is already registered"
          ]
        )
      );
    }

    // Create user
    const newUser = {
      id: Date.now().toString(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);

    // Success response
    return res.status(201).json(
      successResponse(
        "User registered successfully",
        {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          createdAt: newUser.createdAt
        }
      )
    );

  } catch (error) {

    console.error(
      "Register endpoint error:",
      error
    );

    return res.status(500).json(
      errorResponse(
        "Internal server error",
        [
          "Something went wrong while registering the user"
        ]
      )
    );
  }
};

module.exports = {
  registerUser
};