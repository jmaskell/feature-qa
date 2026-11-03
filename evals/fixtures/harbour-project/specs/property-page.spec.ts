// QA spec for the property page (docs/plans/7-property-page). One test for each state of design.md.
import { expect } from "@playwright/test";
import { createQaTest } from "@feature-qa/kit";
import config from "../qa.config.ts";
import { inEvalSandbox } from "../eval-sandbox.ts";

// inEvalSandbox changes nothing outside the eval sandbox.
const test = inEvalSandbox(createQaTest(config));

// AC1: The properties list shows each property with its address, rent and status.
// AC2: The property page shows the address, the monthly rent and the status of the property.
// AC3: On a let property, the agent sees the tenant's name and phone and can open a message dialog. A vacant property says "None".
// AC4: The tenant's name, email and phone never show in the page title, the URL or browser storage.

test.describe("property page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in?as=agent");
  });

  test("Properties list: All properties", async ({ page, qa }) => {
    await page.goto("/properties");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Properties");
    await expect(page.locator("li.row")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "12 Harbour Row, Penzance" })).toBeVisible();
    await expect(page.getByText("£950 a month")).toBeVisible();
    await qa.step("All properties", { state: "Properties list: All properties", criteria: ["AC1"], actionsAs: "agent" });
  });

  test("Property page: Let", async ({ page, qa }) => {
    await page.goto("/properties");
    await page.getByRole("link", { name: "12 Harbour Row, Penzance" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("12 Harbour Row, Penzance");
    await expect(page.getByText("£950 a month")).toBeVisible();
    await expect(page.getByText("Let", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Message tenant" })).toBeVisible();
    await qa.step("Let", { state: "Property page: Let", criteria: ["AC2", "AC3", "AC4"] });
  });

  test("Property page: Vacant", async ({ page, qa }) => {
    await page.goto("/properties");
    await page.getByRole("link", { name: "3 Mill Lane, Hebden Bridge" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("3 Mill Lane, Hebden Bridge");
    await expect(page.getByText("£720 a month")).toBeVisible();
    await expect(page.getByText("Vacant", { exact: true })).toBeVisible();
    await expect(page.getByText("None", { exact: true })).toBeVisible();
    await qa.step("Vacant", { state: "Property page: Vacant", criteria: ["AC2", "AC3"] });
  });

  test("Message dialog: Open", async ({ page, qa }) => {
    await page.goto("/properties/p1");
    await page.getByRole("button", { name: "Message tenant" }).click();
    const dialog = page.getByRole("dialog", { name: "Message tenant" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Messages are not set up in this test app.")).toBeVisible();
    await qa.step("Open", { state: "Message dialog: Open", criteria: ["AC3"] });
  });
});
