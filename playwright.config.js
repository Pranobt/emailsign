const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    viewport: { width: 1366, height: 900 }
  },
  webServer: {
    command: "node server.js",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000
  }
});
