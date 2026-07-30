import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Serial end-to-end walk of the whole product against a real Postgres:
 * first-run setup, encrypted burn-after-reading drops, the reveal gate's
 * no-consume guarantee, passphrase drops, and the invite flow.
 */
test.describe.configure({ mode: "serial" });

const OWNER = { name: "Test Owner", email: "owner@e2e.test", password: "owner-password-1" };
const GUEST = { name: "Guest User", email: "guest@e2e.test", password: "guest-password-1" };

async function newVisitor(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  return ctx.newPage();
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard");
}

async function createTextDrop(page: Page, content: string, opts?: { passphrase?: string }) {
  await page.goto("/dashboard");
  await page.getByPlaceholder("The secret. Markdown supported.").fill(content);
  if (opts?.passphrase) {
    await page.getByText("Protect with a passphrase instead of a link key").click();
    await page
      .getByPlaceholder("Passphrase (share it over a separate channel)")
      .fill(opts.passphrase);
  }
  await page.getByRole("button", { name: "Create drop" }).click();

  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Drop created")).toBeVisible();
  const shareUrl = (await modal.locator("p.font-mono").first().textContent())!.trim();
  await modal.getByRole("button", { name: "Done" }).click();
  return shareUrl;
}

test("first run creates the owner account", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("First run — create the owner")).toBeVisible();

  await page.getByLabel("Display name").fill(OWNER.name);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password (min 8 characters)").fill(OWNER.password);
  await page.getByRole("button", { name: "Create owner account" }).click();

  await page.waitForURL("**/dashboard");
  await expect(page.getByText(OWNER.name)).toBeVisible();
});

test("owner can log out and back in with credentials", async ({ page }) => {
  await login(page, OWNER.email, OWNER.password);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/");
  await login(page, OWNER.email, OWNER.password);
});

test("encrypted drop: reveal gate does not consume, reveal burns", async ({ page, browser }) => {
  await login(page, OWNER.email, OWNER.password);
  const shareUrl = await createTextDrop(page, "# Top Secret\n\nthe **eagle** lands at dawn");
  expect(shareUrl).toContain("#k=");

  // A visitor (or a link-preview bot) loading the page must not burn the view.
  const bot = await newVisitor(browser);
  await bot.goto(shareUrl);
  await expect(bot.getByText("A secret awaits")).toBeVisible();
  await bot.close();

  await page.goto("/dashboard");
  await expect(page.getByText("0/1 views").first()).toBeVisible();

  // A real recipient reveals: content decrypts client-side, markdown renders.
  const recipient = await newVisitor(browser);
  await recipient.goto(shareUrl);
  await recipient.getByRole("button", { name: /Reveal/ }).click();
  await expect(recipient.getByRole("heading", { name: "Top Secret" })).toBeVisible();
  await expect(recipient.getByText("eagle")).toBeVisible();
  await expect(recipient.getByText(/the drop is now ash/)).toBeVisible();
  await recipient.close();

  // The next visitor is too late.
  const late = await newVisitor(browser);
  await late.goto(shareUrl);
  await expect(late.getByText("This drop is gone")).toBeVisible();
  await late.close();
});

test("passphrase drop: wrong passphrase can retry without burning another view", async ({
  page,
  browser,
}) => {
  await login(page, OWNER.email, OWNER.password);
  const shareUrl = await createTextDrop(page, "vault combo: 12-34-56", {
    passphrase: "open sesame",
  });
  expect(shareUrl).not.toContain("#k=");

  const recipient = await newVisitor(browser);
  await recipient.goto(shareUrl);
  await recipient.getByPlaceholder("Passphrase").fill("wrong guess");
  await recipient.getByRole("button", { name: /Reveal/ }).click();

  await expect(recipient.getByText(/didn't work/)).toBeVisible();

  // Retry with the right passphrase — no fresh consume needed.
  await recipient.getByPlaceholder("Passphrase").fill("open sesame");
  await recipient.getByRole("button", { name: "Unlock" }).click();
  await expect(recipient.getByText("vault combo: 12-34-56")).toBeVisible();
  await recipient.close();
});

test("invite flow: new user signs up and sees only their own drops", async ({ page, browser }) => {
  await login(page, OWNER.email, OWNER.password);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Generate invite" }).click();
  const inviteUrl = (await page
    .locator("p.font-mono", { hasText: "/signup?token=" })
    .first()
    .textContent())!.trim();

  const guest = await newVisitor(browser);
  await guest.goto(inviteUrl);
  await guest.getByLabel("Display name").fill(GUEST.name);
  await guest.getByLabel("Email").fill(GUEST.email);
  await guest.getByLabel("Password (min 8 characters)").fill(GUEST.password);
  await guest.getByLabel("Confirm password").fill(GUEST.password);
  await guest.getByRole("button", { name: "Create account" }).click();
  await guest.waitForURL("**/dashboard");

  // The guest sees an empty dashboard — the owner's drops are invisible.
  await expect(guest.getByText("Nothing here yet")).toBeVisible();
  // And no admin nav.
  await expect(guest.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await guest.close();
});

test("admin panel lists users and runs the retention sweep", async ({ page }) => {
  await login(page, OWNER.email, OWNER.password);
  await page.goto("/dashboard/admin");

  await expect(page.getByRole("cell", { name: new RegExp(OWNER.name) })).toBeVisible();
  await expect(page.getByRole("cell", { name: new RegExp(GUEST.name) })).toBeVisible();

  await page.getByRole("button", { name: "Run retention sweep now" }).click();
  await expect(page.getByText(/Purged \d+ bodies/)).toBeVisible();
});
