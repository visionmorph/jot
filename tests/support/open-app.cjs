async function openApp(page) {
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({
    contentType: "text/css",
    body: "",
  }));
  await page.goto("/");
}

module.exports = { openApp };
