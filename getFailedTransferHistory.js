const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { loginVantage } = require('./loginVantage');

const TARGET_URL = 'https://ibportal.vtg-mkt-apac.com/rebatePaymentHistory';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getTodayVN() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

async function checkFailedTransferHistory() {
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox']
    });

    const page = await browser.newPage();

    const today = getTodayVN();
    let rejectedRows = [];
    let pendingRows = [];
    let csvPath = null;

    try {
        /* ===== LOGIN ===== */
        await loginVantage(page);

        /* ===== OPEN PAGE ===== */
        await page.goto(TARGET_URL, {
            waitUntil: 'networkidle2',
            timeout: 120000
        });

        try { await page.keyboard.press('Escape'); } catch {}
        await sleep(3000);

        /* ===== TAB ===== */
        await page.waitForSelector('#tab-transferHistory', {
            visible: true,
            timeout: 15000
        });

        const tab = await page.$('#tab-transferHistory');
        const box = await tab.boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await sleep(2000);

        /* ===== READ TABLE ===== */
        let stopAll = false;

        while (!stopAll) {
            await page.waitForSelector('tr.el-table__row', { timeout: 15000 });
            const rows = await page.$$('tr.el-table__row');

            let visibleRows = [];

            for (const row of rows) {
                const box = await row.boundingBox();
                if (!box) continue;

                const data = await row.$$eval('td .cell', cells => ({
                    date: cells[0]?.innerText.trim() || '',
                    targetAccount: cells[2]?.innerText.replace(/\(.*?\)/g, '').trim(),
                    amount: cells[3]?.innerText.replace(/[$\s]/g, '').trim(),
                    status: cells[4]?.innerText.trim()
                }));

                visibleRows.push(data);
            }

            for (const row of visibleRows) {
                if (row.date !== today) {
                    stopAll = true;
                    break;
                }

                if (row.status.includes('Từ Chối')) {
                    rejectedRows.push(row);
                }

                if (row.status.includes('Chưa thanh toán')) {
                    pendingRows.push(row);
                }
            }

            if (stopAll) break;

            const nextBtn = await page.$('button.btn-next:not([disabled])');
            if (!nextBtn) break;

            await nextBtn.click();
            await sleep(2500);
        }

        /* ===== CSV ===== */
        if (rejectedRows.length > 0) {
            csvPath = path.join(
                __dirname,
                `rejected_${today.replace(/\//g, '-')}.csv`
            );

            const csv = rejectedRows
                .map(r => `${r.targetAccount},${r.amount}`)
                .join('\n');

            fs.writeFileSync(csvPath, csv, 'utf8');
        }

        return {
            today,
            rejectedRows,
            pendingRows,
            csvPath
        };

    } finally {
        await browser.close();
    }
}

module.exports = { checkFailedTransferHistory };
