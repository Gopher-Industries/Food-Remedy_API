const {
  runAllTests
} = require("./test_db030_integration");

runAllTests()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n[FAILED TEST]");
    console.error(error);

    process.exit(1);
  });