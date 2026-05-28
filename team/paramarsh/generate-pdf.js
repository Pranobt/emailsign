const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();

  // Match A4 at 96 dpi; deviceScaleFactor: 2 renders images at 2× for sharpness
  const context = await browser.newContext({
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  const filePath = path.resolve(__dirname, 'share.html');
  console.log('Loading:', filePath);

  // networkidle waits for external fonts (Google Fonts, onlinewebfonts) to finish
  await page.goto('file://' + filePath, { waitUntil: 'networkidle' });

  // Ensure all web fonts are fully rendered before capturing
  await page.evaluate(() => document.fonts.ready);

  // Give JS scaling a moment to settle
  await new Promise(r => setTimeout(r, 500));

  const outPath = path.resolve(__dirname, 'Paramarsh 3 Invite 28 Mar.pdf');

  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    scale: 1,
  });

  console.log('PDF saved:', outPath);
  await browser.close();
})();
