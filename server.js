const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { chromium } = require('@playwright/test');

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

const sendError = (res, code) => {
    const errorPage = path.join(ROOT, 'error.html');
    fs.readFile(errorPage, (err, data) => {
        res.writeHead(code, { 'Content-Type': 'text/html' });
        res.end(err ? `<h1>${code}</h1>` : data);
    });
};

const generatePdf = async (targetUrl) => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 794, height: 900 },
    });
    const page = await context.newPage();

    // Load without ?export=1 so no is-exporting class fires — we control everything via injected style
    const cleanUrl = targetUrl.replace('?export=1', '');
    await page.goto(cleanUrl, { waitUntil: 'networkidle', timeout: 30000 });

    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() =>
        Promise.all(Array.from(document.images).map(img =>
            img.complete ? Promise.resolve()
                : new Promise(r => { img.onload = r; img.onerror = r; })
        ))
    );
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.addStyleTag({ content: `
        * { box-sizing: border-box !important; }
        html {
            overflow: visible !important;
            background: white !important;
        }
        body {
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
        }
        .document { background: white !important; }
        .step-marker { box-shadow: none !important; }
        .timeline-panel { background: #f3fbff !important; }
        .document {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 10mm 14mm !important;
            margin: 0 !important;
        }
        /* Tighten gaps between sections */
        .document > * + * { margin-top: 7px !important; }

        /* Compact section padding */
        .panel, .timeline-panel { padding: 8px 12px !important; }
        .panel h2 { margin-bottom: 5px !important; font-size: 11px !important; }
        .panel-text { margin-bottom: 6px !important; font-size: 11px !important; }

        /* Letter section compactness */
        .letter-meta { margin-bottom: 10px !important; gap: 3px !important; }
        .letter-to { margin-bottom: 10px !important; font-size: 12px !important; }
        .letter-subject { margin-bottom: 10px !important; font-size: 12px !important; }
        .letter-opening { margin-bottom: 12px !important; font-size: 11px !important; }
        .letter-divider { margin-bottom: 12px !important; }

        /* Compact lists */
        .clean-list { gap: 5px !important; }
        .clean-list li { font-size: 11px !important; }

        /* Stats row */
        .stats {
            display: grid !important;
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
            gap: 6px !important;
        }
        .stat { padding: 7px !important; }
        .stat-number { white-space: nowrap !important; font-size: 15px !important; }
        .stat-label { font-size: 6.5px !important; }

        /* Doctor image — show full photo */
        .doctor-collage { width: 100% !important; height: auto !important; max-height: none !important; object-fit: unset !important; }

        /* Prevent any panel from splitting across pages */
        section, .panel, div.panel {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
        }

        /* App screenshots — fill page 3 */
        .app-screens { gap: 8px !important; }
        .app-screens img { width: 100% !important; height: auto !important; max-height: none !important; object-fit: contain !important; display: block !important; }
        .app-store-row img { height: 30px !important; }
        .app-text { font-size: 11px !important; }

        /* Press logos */
        .press-logos img { height: 18px !important; }

        /* Contact */
        .contact {
            padding: 20px 16px !important;
            border-radius: 12px !important;
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            width: 100% !important;
        }

        /* Timeline */
        .timeline-row {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            padding-top: 18px !important;
        }
        .step-title { font-size: 11px !important; }
        .step-sub { font-size: 10px !important; }
        .roadmap { gap: 8px !important; }

        .download-area { display: none !important; }
    `});

    // Debug: log page height to server console
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    console.log(`Page height before PDF: ${pageHeight}px`);

    const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '0', bottom: '12mm', left: '0' }
    });

    await browser.close();
    return pdf;
};

const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === 'POST' && requestUrl.pathname === '/update-user-directory') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            try {
                const { dept, name, encodedCode } = JSON.parse(body);
                if (!dept || !name || !encodedCode) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, message: 'Missing fields' }));
                    return;
                }

                const insertUser = (content, deptName, userName, code) => {
                    const escaped = deptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const match = new RegExp(`(["']?${escaped}["']?\\s*:\\s*\\{)`).exec(content);
                    if (!match) return null;
                    const pos = match.index + match[0].length;
                    const after = content.slice(pos);
                    const indentMatch = /\n(\s+)"/.exec(after);
                    const indent = indentMatch ? indentMatch[1] : '          ';
                    const entry = `\n${indent}"${userName}": "${code}",`;
                    // Skip if already present
                    if (content.includes(`"${userName}"`)) return content;
                    return content.slice(0, pos) + entry + content.slice(pos);
                };

                const taskDataPath = path.join(ROOT, 'team', 'task-data.js');
                let taskData = fs.readFileSync(taskDataPath, 'utf8');
                const updatedTaskData = insertUser(taskData, dept, name, encodedCode);
                if (updatedTaskData && updatedTaskData !== taskData) {
                    fs.writeFileSync(taskDataPath, updatedTaskData, 'utf8');
                }

                const adminPath = path.join(ROOT, 'team', 'admin.html');
                let adminHtml = fs.readFileSync(adminPath, 'utf8');
                const updatedAdmin = insertUser(adminHtml, dept, name, encodedCode);
                if (updatedAdmin && updatedAdmin !== adminHtml) {
                    fs.writeFileSync(adminPath, updatedAdmin, 'utf8');
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, message: err.message }));
            }
        });
        return;
    }

    if (requestUrl.pathname === '/download-pdf') {
        const fileParam = requestUrl.searchParams.get('file') || 'avi.html';
        const baseName = path.basename(fileParam, '.html');
        const pdfName = `Finnovate_${baseName}_Proposal.pdf`;
        const targetUrl = `http://localhost:${PORT}/${fileParam}?export=1`;
        try {
            const pdf = await generatePdf(targetUrl);
            res.writeHead(200, {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${pdfName}"`,
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
        sendError(res, 403);
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err) {
            sendError(res, 404);
            return;
        }

        if (stats.isDirectory()) {
            const indexPath = path.join(filePath, 'index.html');
            fs.stat(indexPath, (indexErr) => {
                if (indexErr) {
                    sendError(res, 403);
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
