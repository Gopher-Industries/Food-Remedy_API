const errorLogger = (
  err,
  req,
  res,
  next
) => {

  console.error(
    "========== API ERROR =========="
  );

  console.error(
    "Time:",
    new Date().toISOString()
  );

  console.error(
    "Method:",
    req.method
  );

  console.error(
    "Endpoint:",
    req.originalUrl
  );

  console.error(
    "Error:",
    err.message
  );

  console.error(
    "================================"
  );

  // Send clean response
  res.status(500).json({
    success: false,
    message: "Internal server error"
  });

};

module.exports = errorLogger;