const loggerMiddleware = (req, res, next) => {
  const timestamp = new Date().toISOString();

  const sanitizedBody = {
    ...req.body
  };

  if (sanitizedBody.password) {
    sanitizedBody.password = "HIDDEN";
  }

  console.log("========== API REQUEST ==========");
  console.log("Time:", timestamp);
  console.log("Method:", req.method);
  console.log("Endpoint:", req.originalUrl);
  console.log("Request Body:", sanitizedBody);
  console.log("=================================");

  next();
};

module.exports = loggerMiddleware;