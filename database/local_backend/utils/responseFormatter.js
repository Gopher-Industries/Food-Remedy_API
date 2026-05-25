const successResponse = (message, data = {}) => {
  return {
    success: true,
    message,
    data
  };
};

const errorResponse = (message, errors = []) => {
  return {
    success: false,
    message,
    errors
  };
};

module.exports = {
  successResponse,
  errorResponse
};