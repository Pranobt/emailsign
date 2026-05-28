const express = require('express');
const { chromium } = require('playwright');
const path = require('path');

const app = express();
const PORT = 3001;

// Serve all files in the team folder (images, fonts, html)
app.use(express.static(path.join(__dirname)));

app.get('/download-pdf', async (req, res) => {
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 794, height: 1123 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    // Emulate print media BEFORE loading so screen styles (body padding,
    // grey background, scalePages JS) never apply — clean slate for PDF
    await page.emulateMedia({ media: 'print' });

    // Load via HTTP so all assets (fonts, images) resolve correctly
    await page.goto(`http://localhost:${PORT}/share.html`, { waitUntil: 'networkidle' });

    // Wait for web fonts (Google Fonts, Denton Bold) to fully render
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 800));

    // Strip inline styles set by the mobile scalePages() JS so nothing
    // bleeds into the PDF as extra margins or padding
    await page.evaluate(() => {
      document.body.style.padding   = '';
      document.body.style.margin    = '';
      document.body.style.background = '';
      document.querySelectorAll('.page').forEach(p => {
        p.style.transform      = '';
        p.style.transformOrigin = '';
        p.style.marginLeft     = '';
        p.style.marginRight    = '';
        p.style.marginBottom   = '';
        p.style.marginTop      = '';
      });
      // Also hide the download button
      const btn = document.getElementById('downloadPdf');
      if (btn) btn.style.display = 'none';
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      scale: 1,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Paramarsh 3 Invite 28 Mar.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send('PDF generation failed: ' + err.message);
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`\nServer running at http://localhost:${PORT}`);
  console.log(`Open:          http://localhost:${PORT}/share.html\n`);
});
