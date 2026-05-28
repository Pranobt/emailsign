# Finnovate Proposal Document System

Build professional A4 PDF proposal letters for Finnovate. Each proposal is a standalone HTML file served and rendered to PDF by a Node.js + Playwright server.

## Stack

- Plain HTML + CSS (no frameworks)
- Node.js built-in `http` module for the server
- `@playwright/test` for headless Chromium PDF generation
- No React, no bundler, no build step

## Server Setup

The server (`server.js`) does two things:
1. Serves static files from the project root
2. Exposes `GET /download-pdf?file=filename.html` which uses Playwright to render the HTML and return a PDF

### PDF Generation Logic

```js
const { chromium } = require('@playwright/test');

const generatePdf = async (targetUrl) => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 794, height: 900 } });
    const page = await context.newPage();

    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
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
        html { overflow: visible !important; background: white !important; }
        body {
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
        }
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
        .document > * + * { margin-top: 7px !important; }
        .panel, .timeline-panel { padding: 8px 12px !important; }
        .panel h2 { margin-bottom: 5px !important; font-size: 11px !important; }
        .panel-text { margin-bottom: 6px !important; font-size: 11px !important; }
        .letter-meta { margin-bottom: 10px !important; gap: 3px !important; }
        .letter-to { margin-bottom: 10px !important; font-size: 12px !important; }
        .letter-subject { margin-bottom: 10px !important; font-size: 12px !important; }
        .letter-opening { margin-bottom: 12px !important; font-size: 11px !important; }
        .letter-divider { margin-bottom: 12px !important; }
        .clean-list { gap: 5px !important; }
        .clean-list li { font-size: 11px !important; }
        .stats {
            display: grid !important;
            grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
            gap: 6px !important;
        }
        .stat { padding: 7px !important; }
        .stat-number { white-space: nowrap !important; font-size: 15px !important; }
        .stat-label { font-size: 6.5px !important; }
        .doctor-collage { width: 100% !important; height: auto !important; max-height: none !important; object-fit: unset !important; }
        section, .panel, div.panel { break-inside: avoid !important; page-break-inside: avoid !important; }
        .app-screens { gap: 8px !important; }
        .app-screens img { width: 100% !important; height: auto !important; max-height: none !important; object-fit: contain !important; display: block !important; }
        .app-store-row img { height: 30px !important; }
        .app-text { font-size: 11px !important; }
        .press-logos img { height: 18px !important; }
        .contact {
            padding: 20px 16px !important;
            border-radius: 12px !important;
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            width: 100% !important;
        }
        .step-title { font-size: 11px !important; }
        .step-sub { font-size: 10px !important; }
        .roadmap { gap: 8px !important; }
        .timeline-row {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            padding-top: 18px !important;
        }
        .step-marker { box-shadow: none !important; }
        .timeline-panel { background: #f3fbff !important; }
        .download-area { display: none !important; }
    `});

    const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', right: '0', bottom: '12mm', left: '0' }
    });

    await browser.close();
    return pdf;
};
```

The `/download-pdf` route calls this, sets `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="..."`, and streams the buffer back.

---

## HTML Proposal Structure

Every proposal is a single HTML file. Structure:

```
<head>
  Google Font: Inter
  All CSS inline in <style>
</head>
<body>
  <div id="pdf-content" class="document">
    <header>         ← letterhead + divider + date/ref + addressee + subject + greeting + opening
    <section>        ← Key Metrics (.stats)
    <section>        ← Backed by Doctors (image)
    <section>        ← Past Collaborations
    <section>        ← Objective (.timeline-panel)
    <section>        ← What We Are Proposing / Host an Engaging Session
    <section>        ← Indicative Topics
    <section>        ← Why Partner with Finnovate?
    <section>        ← Team Credentials
    <div>            ← Deliverables
    <div>            ← Timeline (3-step horizontal)
    <section>        ← Optional One-to-One Sessions
    <section>        ← Permission to Meet Doctors
    <section>        ← Closing paragraph (no heading)
    <section>        ← Next Steps
    <section>        ← Confidentiality & Data Privacy
    <section>        ← Featured In (press logos)
    <section>        ← Finnovate Wealth App
    <section class="contact">  ← contact bar
  </div>
  <div class="download-area">  ← Download button (hidden in PDF)
  <script>           ← calls /download-pdf on button click
```

---

## Design System

### CSS Variables
```css
--ink: #1d2935
--muted: #52606d
--accent: #0b8457
--accent-dark: #07543a
--accent-soft: #e5f3ed
--line: #d6e2e8
--paper: #ffffff
```

### Typography
- Font: Inter (400, 600, 700) from Google Fonts
- Base: 12px, line-height 1.4
- Panel headings: 12px uppercase, letter-spacing 0.12em, color `--accent-dark`
- Body text / panel-text: 12px, color `--muted`

### Layout
- `body`: flex column, align-items center, gap 18px, decorative radial gradient background
- `.document`: width 210mm, min-height 297mm, padding 12mm 14mm, white background, border-radius 16px, box-shadow

### Critical CSS rules (always include)
```css
@page { size: A4; margin: 12mm 0; }

/* Prevent sections splitting across pages */
.panel, section, .grid-2, .roadmap, .contact, .stats {
    break-inside: avoid;
    page-break-inside: avoid;
}

/* PDF export overrides (applied via JS class) */
body.is-exporting {
    display: block !important;
    padding: 0 !important;
    background: #fff !important;
}
body.is-exporting .document {
    width: 100% !important;
    min-height: auto !important;
    border-radius: 0 !important;
    box-shadow: none !important;
}
```

---

## Component Reference

### `.panel`
```css
background: #f8fbfa;
border: 1px solid var(--line);
border-radius: 12px;
padding: 12px 14px;
```

### `.timeline-panel`
```css
background: #f3fbff;
border: 1px solid #cfdfe6;
border-radius: 18px;
padding: 14px 16px 18px;
```

### `.stats` — 5-column key metrics
```css
display: grid;
grid-template-columns: repeat(5, minmax(0, 1fr));
gap: 10px;
```
Each `.stat`: accent-soft background, centered, `.stat-number` (16px bold), `.stat-label` (7px uppercase).

### `.clean-list` — bullet list
```css
list-style: none; padding: 0; margin: 0;
display: grid; gap: 8px;
```
Each `li`: flex row, `.dot` (8px circle, accent green) + text span.

### Timeline — 3-step horizontal
```html
<div class="roadmap timeline-row">
  <div class="step">
    <div class="step-marker">1</div>
    <div class="step-content">
      <div class="step-title">...</div>
      <div class="step-sub">...</div>
    </div>
  </div>
  ...
</div>
```
`.step-marker`: 26px circle, green background, white text, centered number.

### `.contact` — footer bar
```css
display: flex; align-items: center; justify-content: space-between;
padding: 12px 14px; border-radius: 12px;
background: #0b6b43; color: #fff;
```
Left side: title + email line. Right side: name title + phone (14px bold).

### `.letter-divider`
```css
height: 4px;
background: linear-gradient(90deg, #0b8457 60%, #f0c040 100%);
border-radius: 2px;
```

---

## Responsive Behaviour

```css
@media (max-width: 960px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
    .grid-2, .commitment-grid, .why-grid,
    .timeline-row, .roadmap-stack { grid-template-columns: 1fr; }
    .contact { flex-direction: column; align-items: flex-start; }
}
```
Note: Playwright renders at 794px width which triggers this breakpoint — that's why the `addStyleTag` injection in `server.js` force-overrides all grids back to their desktop column counts with `!important`.

---

## Standard Content Blocks

### Key Metrics (always these 5)
- 3,800+ Clients served
- 93% Doctors as clients
- 1,200+ Cr AUM managed
- Since 2007 Track record
- 35,000+ Individuals empowered

### Why Partner with Finnovate? (use 3–4 of these)
- **Unbiased** – advice is strictly outcome-focused with no product incentives
- **Holistic Perspective** – align goals, risks, investments, protection, taxes, and legacy planning
- **Personalized Advice** – plans respect clinical schedules, family commitments, and unique priorities
- **Discipline & Accountability** – implementation support and scheduled reviews keep goals on course

### Team Credentials (use 2–3)
- **Founders**: 45+ years of combined experience leading regulated advisory practices
- **FinnFit Experts**: CFP or NISM 10A/10B-certified professionals who craft doctor-specific financial roadmaps
- **Research Analysts**: CFA, MBA, and NISM certified professionals providing research-backed recommendations

### Permission to Meet Doctors (always include)
> We seek permission to meet doctors individually to create a better understanding of Finnovate, its vision, and the value it seeks to bring through knowledge-driven engagement. One-on-one interactions can help build familiarity, trust, and clarity, while also allowing doctors to engage at their convenience in a more personalized setting.

### Closing paragraph (always include)
> We believe such an initiative can create a strong foundation for future engagement while ensuring that the interaction remains educational, relevant, and respectful of their time. We would be grateful for your approval and support in allowing both individual doctor interactions and the proposed knowledge session.

### Indicative Topics (KEM / hospital sessions)
- How often should doctors review their personal finances?
- Understanding the new Income Tax Act and how it impacts medical professionals
- Do delayed earnings affect long-term wealth creation for doctors?
- What role should debt instruments play in long-term planning?
- How to know whether your financial life is on track

---

## Finnovate Brand Details

- **Registered**: SEBI registered financial advisory firm
- **Mumbai HQ**: 703, The Summit Business Park, Andheri–Kurla Road, Andheri East, Mumbai – 400093
- **Pune Office**: 102, 2nd Floor, Fortune Plaza, Thube Park, Shivaji Nagar, Pune – 411005
- **General email**: hello@finnovate.in
- **Website**: finnovate.in

---

## First-Time Setup

```bash
npm install
npx playwright install chromium
node server.js
# Server at http://localhost:3000
```

## Download PDF via terminal

```bash
curl "http://localhost:3000/download-pdf?file=filename.html" -o ~/Desktop/output.pdf
```

---

## gstack

Use the `/browse` skill from gstack for all web browsing tasks. **Never use `mcp__claude-in-chrome__*` tools.**

### Available skills

| Skill | Purpose |
|---|---|
| `/browse` | Headless browser — navigate, interact, screenshot, verify |
| `/connect-chrome` | Connect to a running Chrome instance |
| `/setup-browser-cookies` | Inject auth cookies for browser sessions |
| `/qa` | Full QA run with browser testing |
| `/qa-only` | QA without code changes |
| `/review` | Code review |
| `/design-review` | Design QA in browser |
| `/design-consultation` | Design direction & feedback |
| `/design-shotgun` | Rapid multi-option design generation |
| `/design-html` | HTML/CSS design implementation |
| `/ship` | Ship a feature end-to-end |
| `/land-and-deploy` | Land a branch and deploy |
| `/canary` | Canary deploy & monitor |
| `/benchmark` | Performance benchmarking |
| `/plan-ceo-review` | CEO-level plan review |
| `/plan-eng-review` | Engineering plan review |
| `/plan-design-review` | Design plan review |
| `/plan-devex-review` | Developer experience plan review |
| `/devex-review` | Developer experience review |
| `/office-hours` | Open Q&A / pair session |
| `/investigate` | Deep investigation of an issue |
| `/retro` | Sprint retrospective |
| `/document-release` | Generate release notes |
| `/codex` | AI coding agent tasks |
| `/cso` | Chief of Staff operations |
| `/autoplan` | Auto-generate an implementation plan |
| `/learn` | Learn about a codebase or topic |
| `/setup-deploy` | Configure deployment pipeline |
| `/setup-gbrain` | Configure gstack brain |
| `/careful` | High-caution mode for risky changes |
| `/freeze` | Freeze a branch from changes |
| `/unfreeze` | Unfreeze a branch |
| `/guard` | Guard a file or path from edits |
| `/gstack-upgrade` | Upgrade gstack to latest version |
