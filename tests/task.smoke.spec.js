const { test, expect } = require("@playwright/test");

const TEST_USER = {
  dept: "Direct Reportees",
  name: "Pranob Thachanthara",
  code: "DR-PT-3328"
};

const BASE_QUERY = `dept=${encodeURIComponent(TEST_USER.dept)}&name=${encodeURIComponent(TEST_USER.name)}&code=${encodeURIComponent(TEST_USER.code)}`;

function nextIsoDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function mockIntegrations(page, options = {}) {
  const carryoverTasks = Array.isArray(options.carryoverTasks) ? options.carryoverTasks : [];

  await page.route("https://script.google.com/**", async (route) => {
    const req = route.request();
    const reqUrl = new URL(req.url());
    const callback = reqUrl.searchParams.get("callback");

    if (callback) {
      const action = reqUrl.searchParams.get("action");
      if (action === "getCarryover") {
        const payload = { ok: true, tasks: carryoverTasks, sourceWorkDate: "2026-02-12" };
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: `${callback}(${JSON.stringify(payload)});`
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `${callback}(${JSON.stringify({ ok: true })});`
      });
      return;
    }

    if (req.method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true })
    });
  });

  await page.route("https://flow.zoho.in/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "ok"
    });
  });
}

test("loads valid link and shows locked identity", async ({ page }) => {
  await mockIntegrations(page);
  await page.goto(`/task.html?${BASE_QUERY}`);

  await expect(page.getByText("Name: Pranob Thachanthara | Department: Direct Reportees")).toBeVisible();
  await expect(page.getByText("Invalid access link")).not.toBeVisible();
});

test("submits SOD successfully", async ({ page }) => {
  await mockIntegrations(page);
  await page.goto(`/task.html?${BASE_QUERY}`);

  await page.fill("#newTaskTitle", "Prepare morning updates");
  await page.click("#addTaskBtn");
  await page.click("#submitSodBtn");

  await expect(page.locator("#sodStatus")).toContainText("Start-of-Day submitted successfully");
});

test("EOD validation opens and focuses invalid time field", async ({ page }) => {
  await mockIntegrations(page);
  await page.goto(`/task.html?${BASE_QUERY}`);

  await page.fill("#newTaskTitle", "Review market brief");
  await page.click("#addTaskBtn");
  await page.click("#submitSodBtn");

  await page.locator('[data-field="completionPercent"]').first().selectOption("75");
  await page.click("#submitEodBtn");

  await expect(page.locator("#eodStatus")).toContainText("Dedicated time is required");
  const focusedField = page.locator(':focus[data-field="spentHours"]');
  await expect(focusedField).toBeVisible();
  await expect(page.locator(".field-error").filter({ hasText: "Dedicated time is required" }).first()).toBeVisible();
});

test("carryover shows locked in SOD and restricts EOD options above previous progress", async ({ page }) => {
  await mockIntegrations(page, {
    carryoverTasks: [
      {
        taskId: "carry-1",
        title: "Pending compliance document",
        priority: "Medium",
        lastCompletion: 75,
        lastNote: "Need final review"
      }
    ]
  });
  await page.goto(`/task.html?${BASE_QUERY}`);

  const firstRow = page.locator("#sodTasks .task-row").first();
  await expect(firstRow).toContainText("Locked Carryover");
  await expect(firstRow).toContainText("Prev: 75%");
  await expect(firstRow.locator("button[aria-label='Remove task']")).toHaveCount(0);

  const options = page.locator('[data-field="completionPercent"]').first().locator("option");
  await expect(options).toHaveCount(3); // Select + 90 + 100
  await expect(options.nth(1)).toHaveAttribute("value", "90");
  await expect(options.nth(2)).toHaveAttribute("value", "100");
});

test("EOD submit moves incomplete tasks to next day SOD as locked carryover", async ({ page }) => {
  await mockIntegrations(page);
  await page.goto(`/task.html?${BASE_QUERY}`);

  await page.fill("#newTaskTitle", "Build daily checklist");
  await page.click("#addTaskBtn");
  await page.click("#submitSodBtn");

  await page.locator('[data-field="completionPercent"]').first().selectOption("75");
  await page.locator('[data-field="spentHours"]').first().fill("1");
  await page.locator('[data-field="spentMinutes"]').first().fill("15");
  await page.click("#submitEodBtn");

  await expect(page.locator("#eodStatus")).toContainText("End-of-Day submitted successfully");
  await expect(page.locator("#workDate")).toHaveValue(nextIsoDate());

  const sodRow = page.locator("#sodTasks .task-row").first();
  await expect(sodRow).toContainText("Locked Carryover");
  await expect(sodRow).toContainText("Prev: 75%");
});
