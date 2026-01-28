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
        headless: false, // đổi true khi chạy server
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--start-maximized'
        ],
        defaultViewport: null
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    const today = getTodayVN();
    let rejectedRows = [];
    let pendingRows = [];
    let csvPath = null;

    try {
        /* ================= LOGIN ================= */
        await loginVantage(page);

        /* ================= OPEN PAGE ================= */
        await page.goto(TARGET_URL, {
            waitUntil: 'networkidle2',
            timeout: 120000
        });

        // đóng popup nếu có
        try { await page.keyboard.press('Escape'); } catch {}
        await sleep(3000);

        /* ================= CLICK TAB (JS CLICK) ================= */
        await page.waitForSelector('#tab-transferHistory', { timeout: 20000 });

        await page.evaluate(() => {
            const tab = document.querySelector('#tab-transferHistory');
            tab.scrollIntoView({ block: 'center' });
            tab.click();
        });

        await sleep(3000);

        /* ================= READ TABLE ================= */
        let stopAll = false;

        while (!stopAll) {
            await page.waitForSelector('tr.el-table__row', { timeout: 20000 });

            // lấy dữ liệu table bằng evaluate (KHÔNG HANDLE)
            const visibleRows = await page.$$eval('tr.el-table__row', rows =>
                rows.map(row => {
                    const cells = row.querySelectorAll('td .cell');
                    return {
                        date: (cells[0]?.innerText || '').trim(),
                        targetAccount: (cells[2]?.innerText || '')
                            .replace(/\(.*?\)/g, '')
                            .trim(),
                        amount: (cells[3]?.innerText || '')
                            .replace(/[$\s]/g, '')
                            .trim(),
                        status: (cells[4]?.innerText || '').trim() // ← QUAN TRỌNG
                    };
                })
            );
            
            for (const row of visibleRows) {
                if (!row.date) continue;      // bỏ row rác
                if (!row.status) continue;    // bỏ row rác

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

            // kiểm tra có trang tiếp không
            const hasNext = await page.$('button.btn-next:not([disabled])');
            if (!hasNext) break;

            // CLICK NEXT BẰNG JS
            await page.evaluate(() => {
                document
                    .querySelector('button.btn-next:not([disabled])')
                    ?.click();
            });

            await sleep(2500);
        }

        /* ================= CSV ================= */
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

    } catch (err) {
        console.error('❌ checkFailedTransferHistory error:', err);
        throw err;
    } finally {
        await browser.close();
    }
}

module.exports = { checkFailedTransferHistory };
