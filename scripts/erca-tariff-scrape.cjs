// Scrapes the public ERCA tariff book (codes, descriptions, units and all tax rates) into JSON.
// Sequential requests with a pause between them; resumable via progress files.
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const out = process.argv[2];
const pauseMs = 350;
const wait = ms => new Promise(r => setTimeout(r, ms));
const codesFile = path.join(out, "erca-codes.json");
const linesFile = path.join(out, "erca-lines.json");
const load = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
const columns = ["DR", "ER", "VAT", "WHR", "SR", "EXR", "D2R", "DSR", "DAR"];

(async () => {
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--ignore-certificate-errors"] });
  const page = await browser.newPage();
  const open = () => page.goto("https://customs.erca.gov.et/trade/help/tariff/search", { waitUntil: "networkidle2", timeout: 120000 });
  await open();

  // 1. Every national code per chapter.
  const codes = load(codesFile, {});
  for (let chapter = 1; chapter <= 99; chapter++) {
    const key = String(chapter).padStart(2, "0");
    if (codes[key]) continue;
    const rows = await page.evaluate(async term => {
      const q = new URLSearchParams({ term, keyFieldValue: term, beanClass: "HT_TAR", keyField: "code", sortBy: JSON.stringify({ code: "asc" }), htDate: new Date().toLocaleDateString("en-GB"), hideAdditionalInfo: "true", showFields: "code,description", selectFields: "code,description", valueField: "code", searchByFields: "code", minLength: "2", maxResults: "10000" });
      const r = await fetch(`/trade/beanDataLoad/loadData?${q}`);
      if (!r.ok) throw new Error(`lookup ${term}: ${r.status}`);
      return r.json();
    }, key);
    codes[key] = rows;
    fs.writeFileSync(codesFile, JSON.stringify(codes));
    console.log(`chapter ${key}: ${rows.length} codes`);
    await wait(pauseMs);
  }
  const allCodes = Object.values(codes).flat();
  const headings = [...new Set(allCodes.map(row => row.code.slice(0, 4)))].sort();
  console.log(`total codes ${allCodes.length}, headings ${headings.length}`);

  // 2. Rates for every heading.
  const lines = load(linesFile, {});
  let done = 0;
  for (const heading of headings) {
    if (lines[heading]) { done++; continue; }
    let attempt = 0, result;
    while (true) {
      try {
        result = await page.evaluate(async (heading, columns) => {
          const parse = html => {
            const doc = new DOMParser().parseFromString(html, "text/html");
            const found = Number((doc.querySelector(".alert")?.textContent.match(/(\d+)\s+Tariff found/) ?? [])[1] ?? 0);
            const header = [...doc.querySelectorAll("table thead th")].map(th => th.textContent.trim());
            const rows = [...doc.querySelectorAll("table tbody tr")].filter(tr => tr.querySelector("td.link")).map(tr => {
              const cells = [...tr.querySelectorAll("td")].map(td => td.textContent.trim().replace(/\s+/g, " "));
              const row = { code: cells[1], description: cells[2], unit: cells[3], rates: {} };
              columns.forEach(column => { const index = header.indexOf(column); if (index >= 0) row.rates[column] = cells[index] ?? ""; });
              return row;
            });
            const next = [...doc.querySelectorAll("a")].find(a => /next|›|»/i.test(a.textContent.trim()) && /offset=/.test(a.getAttribute("href") ?? ""))?.getAttribute("href") ?? null;
            return { found, rows, next };
          };
          const body = new URLSearchParams({ keywords: "", tariff: heading, searchMode: "ANY", _action_searchByTariffKeywords: "Search", pageSize: "50" });
          let r = await fetch("/trade/help/tariff/search", { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
          if (!r.ok) throw new Error(`search ${heading}: ${r.status}`);
          let parsed = parse(await r.text());
          const rows = [...parsed.rows];
          let guard = 0;
          while (parsed.next && rows.length < parsed.found && guard++ < 40) {
            r = await fetch(parsed.next);
            if (!r.ok) throw new Error(`page ${heading}: ${r.status}`);
            parsed = parse(await r.text());
            rows.push(...parsed.rows);
          }
          return { found: parsed.found || rows.length, rows };
        }, heading, columns);
        break;
      } catch (error) {
        if (++attempt >= 4) throw error;
        console.log(`retry ${heading} (${error.message})`);
        await wait(3000 * attempt);
        await open();
      }
    }
    lines[heading] = result;
    done++;
    if (result.rows.length < result.found) console.log(`WARNING ${heading}: ${result.rows.length} of ${result.found} rows`);
    if (done % 25 === 0 || done === headings.length) { fs.writeFileSync(linesFile, JSON.stringify(lines)); console.log(`headings ${done}/${headings.length}`); }
    await wait(pauseMs);
  }
  fs.writeFileSync(linesFile, JSON.stringify(lines));
  const scraped = Object.values(lines).reduce((sum, h) => sum + h.rows.length, 0);
  console.log(`DONE: ${scraped} tariff lines with rates from ${headings.length} headings; ${allCodes.length} codes in lookup.`);
  await browser.close();
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
