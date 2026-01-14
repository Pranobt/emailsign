const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const puppeteer = require('puppeteer');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.json': 'application/json'
};

const resolveSafePath = (pathname) => {
    const safePath = path.normalize(path.join(ROOT, pathname));
    if (!safePath.startsWith(ROOT)) {
        return null;
    }
    return safePath;
};

const sendFile = (res, filePath) => {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Server error.');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(data);
    });
};

const generatePdf = async (targetUrl) => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    await page.goto(targetUrl, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    await page.evaluate(async () => {
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }
    });
    await page.waitForFunction(
        () => document.body && document.body.classList.contains('is-exporting'),
        { timeout: 2000 }
    ).catch(() => {});
    const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });
    await browser.close();
    return pdf;
};

const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, `http://localhost:${PORT}`);

    if (requestUrl.pathname === '/download-pdf') {
        const fileParam = requestUrl.searchParams.get('file') || 'avi.html';
        const targetUrl = `http://localhost:${PORT}/${fileParam}?export=1`;
        try {
            const pdf = await generatePdf(targetUrl);
            res.writeHead(200, {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="Finnovate_Partnership_A4.pdf"',
                'Content-Length': pdf.length
            });
            res.end(pdf);
        } catch (error) {
            console.error('PDF generation failed', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('PDF generation failed.');
        }
        return;
    }

    const pathname = requestUrl.pathname === '/' ? '/avi.html' : requestUrl.pathname;
    const filePath = resolveSafePath(pathname);

    if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden.');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found.');
            return;
        }

        if (stats.isDirectory()) {
            const indexPath = path.join(filePath, 'index.html');
            fs.stat(indexPath, (indexErr) => {
                if (indexErr) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('Not found.');
                    return;
                }
                sendFile(res, indexPath);
            });
            return;
        }

        sendFile(res, filePath);
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Open /avi.html and use "Download PDF" for A4 export.');
});
