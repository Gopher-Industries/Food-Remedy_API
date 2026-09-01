"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "food-remedy-release-gate-"));
const invalidSource = path.join(temporaryDirectory, "invalid-release-check.js");

try {
  fs.writeFileSync(invalidSource, "const = ;\n", "utf8");
  const check = spawnSync(process.execPath, ["--check", invalidSource], {
    encoding: "utf8",
  });

  if (check.status === 0 || !/SyntaxError/.test(check.stderr)) {
    throw new Error("The syntax check did not reject the intentionally invalid source file.");
  }

  console.log("Release gate failure probe passed: syntax failures are detected.");
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
