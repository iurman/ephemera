/**
 * Capture marketing/README screenshots against a running server.
 * Usage: node scripts/screenshots.mjs http://127.0.0.1:3111 ./docs/screenshots
 * Expects a FRESH database (no users).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3111";
const OUT = process.argv[3] ?? "docs/screenshots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

async function shot(name) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`captured ${name}`);
}

// Landing
await page.goto(`${BASE}/`);
await shot("landing");

// First-run setup -> owner
await page.goto(`${BASE}/login`);
await page.getByLabel("Display name").fill("Isaac");
await page.getByLabel("Email").fill("isaac@example.com");
await page.getByLabel("Password (min 8 characters)").fill("screenshot-password");
await page.getByRole("button", { name: "Create owner account" }).click();
await page.waitForURL("**/dashboard");

async function createDrop({ content, label, views = 1, ttlIndex, passphrase }) {
  await page.goto(`${BASE}/dashboard`);
  await page.getByPlaceholder("The secret. Markdown supported.").fill(content);
  if (label) {
    await page.getByPlaceholder(/Label \(optional/).fill(label);
  }
  if (views !== 1) {
    await page.getByLabel("Maximum views").fill(String(views));
  }
  if (ttlIndex !== undefined) {
    await page.locator("select").first().selectOption({ index: ttlIndex });
  }
  if (passphrase) {
    await page.getByText("Protect with a passphrase instead of a link key").click();
    await page.getByPlaceholder(/Passphrase \(share/).fill(passphrase);
  }
  await page.getByRole("button", { name: "Create drop" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByText("Drop created").waitFor();
  const shareUrl = (await modal.locator("p.font-mono").first().textContent()).trim();
  return { shareUrl, modal };
}

// A few drops in different states
const runbook = await createDrop({
  label: "prod incident runbook",
  content:
    "# Incident Runbook\n\n1. Check `kubectl get pods -n prod`\n2. Roll back with:\n\n```bash\nhelm rollback api 42 --namespace prod\n```\n\n> Escalate to on-call if the queue depth keeps climbing.",
  views: 5,
  ttlIndex: 6,
});
await runbook.modal.getByRole("button", { name: "Done" }).click();

const dbCreds = await createDrop({
  label: "staging db password",
  content: "postgres://svc_reporting:h4rd-t0-gu3ss@db.staging.internal:5432/analytics",
  views: 1,
  ttlIndex: 4,
});
await dbCreds.modal.getByRole("button", { name: "Done" }).click();

const wifi = await createDrop({
  label: "office wifi (passphrase)",
  content: "SSID: emberworks-5g\npass: moth-to-flame-2026",
  views: 3,
  ttlIndex: 5,
  passphrase: "hallway-poster",
});
await wifi.modal.getByRole("button", { name: "Done" }).click();

// Consume some views on the runbook so stats have data
const viewer = await ctx.browser().newContext({ viewport: { width: 1200, height: 800 } });
for (let i = 0; i < 2; i++) {
  const vp = await viewer.newPage();
  await vp.goto(runbook.shareUrl);
  await vp.getByRole("button", { name: /Reveal/ }).click();
  await vp.getByRole("heading", { name: "Incident Runbook" }).waitFor();
  await vp.close();
}
await viewer.close();

// Share modal with QR (fresh drop so modal is open)
const share = await createDrop({
  label: "deploy token",
  content: "ghp_exampletoken1234567890abcdef",
  views: 1,
  ttlIndex: 2,
});
await share.modal.getByRole("button", { name: "Show QR" }).click();
await page.waitForTimeout(400);
await shot("share-modal");
await share.modal.getByRole("button", { name: "Done" }).click();

// Dashboard with data
await page.goto(`${BASE}/dashboard`);
await page.waitForTimeout(1200);
await shot("dashboard");

// Drop detail with sparkline
await page.goto(`${BASE}/dashboard`);
await page
  .locator("div", { hasText: "prod incident runbook" })
  .locator("a", { hasText: "Details" })
  .first()
  .click();
await page.getByText("Views per minute").waitFor();
await shot("drop-detail");

// Reveal gate + revealed content (recipient's perspective)
const recipCtx = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
const recip = await recipCtx.newPage();
await recip.goto(runbook.shareUrl);
await recip.getByRole("heading", { name: "A secret awaits" }).waitFor();
await recip.waitForTimeout(500);
await recip.screenshot({ path: `${OUT}/reveal-gate.png` });
console.log("captured reveal-gate");
await recip.getByRole("button", { name: /Reveal/ }).click();
await recip.getByRole("heading", { name: "Incident Runbook" }).waitFor();
await recip.waitForTimeout(800);
await recip.screenshot({ path: `${OUT}/revealed.png` });
console.log("captured revealed");
await recipCtx.close();

// Admin
await page.goto(`${BASE}/dashboard/admin`);
await page.getByRole("heading", { name: "Pending invites" }).waitFor();
await shot("admin");

await browser.close();
console.log("done");
