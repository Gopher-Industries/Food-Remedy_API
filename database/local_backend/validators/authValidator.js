const validateRegisterInput = ({ name, email, password }) => {
  const errors = [];

  // Name validation
  if (!name || name.trim() === "") {
    errors.push("Name is required");
  }

  // Email validation
  if (!email || email.trim() === "") {
    errors.push("Email is required");
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (email && !emailRegex.test(email)) {
    errors.push("Invalid email format");
  }

  // Password validation
  if (!password || password.trim() === "") {
    errors.push("Password is required");
  }

  // Password length validation
  if (password && password.length < 6) {
    errors.push("Password must be at least 6 characters long");
  }

  return errors;
};

module.exports = {
  validateRegisterInput
};