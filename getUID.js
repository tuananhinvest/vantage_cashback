const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');
require('dotenv').config();

const { loginVantage } = require('./loginVantage');
const { insertCustomerIfNotExists } = require('./db');
const { sendMessage } = require('./telegramAPI');

const USER_ID = process.env.TELEGRAM_ID;
const TARGET_URL = 'https://ibportal.vtg-mkt-apac.com/ibaccounts';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* ================= CORE ================= */

async function syncVantageCustomers() {
    console.log('🚀 Bắt đầu sync customers Vantage');

    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--start-maximized'
        ],
        defaultViewport: null
    });

    const page = await browser.newPage();

    try {
        //await sendMessage(USER_ID, '🔄 Bắt đầu đồng bộ tài khoản Vantage');

        /* 1️⃣ LOGIN */
        await loginVantage(page);
        await sleep(3000);

        /* 2️⃣ VÀO TRANG IB ACCOUNTS */
        await page.goto(TARGET_URL, {
            waitUntil: 'networkidle2',
            timeout: 120000
        });

        await sleep(3000);

        /* 3️⃣ CLICK DOWNLOAD */
        console.log('⬇️ Đang tải file danh sách tài khoản...');

        await page.evaluate(() => {
            const btn = document.querySelector('.ht-icon-download');
            if (!btn) {
                throw new Error('Không tìm thấy nút download');
            }

            btn.scrollIntoView({ block: 'center' });

            ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => {
                btn.dispatchEvent(
                    new MouseEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    })
                );
            });
        });

        await sleep(7000);

        /* 4️⃣ LẤY FILE EXCEL MỚI NHẤT */
        const DOWNLOAD_DIR = path.join(os.homedir(), 'Downloads');

        const files = fs.readdirSync(DOWNLOAD_DIR)
            .filter(f =>
                f.endsWith('.xlsx') &&
                !f.endsWith('.crdownload')
            )
            .map(name => ({
                name,
                fullPath: path.join(DOWNLOAD_DIR, name),
                time: fs.statSync(path.join(DOWNLOAD_DIR, name)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        if (!files.length) {
            throw new Error('Không tìm thấy file Excel sau khi tải');
        }

        const excelPath = files[0].fullPath;
        console.log('📄 File tải về:', files[0].name);

        /* 5️⃣ ĐỌC FILE & INSERT DB */
        const wb = XLSX.readFile(excelPath);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        let inserted = 0;

        for (let i = 1; i < rows.length; i++) {
            const uid = String(rows[i][2] || '').trim(); // C

            if (!uid) continue;

            await insertCustomerIfNotExists(uid, 'Vantage');
            inserted++;
        }

        console.log(`✅ Đã xử lý ${inserted} tài khoản`);
        await sendMessage(USER_ID, `✅ Đồng bộ xong ${inserted} tài khoản Vantage`);

    } catch (err) {
        console.error('❌ Lỗi syncVantageCustomers:', err.message);
        await sendMessage(USER_ID, '❌ Lỗi khi đồng bộ tài khoản Vantage');
        throw err;
    } finally {
        await sleep(5000);
        await browser.close();
    }
}

/* ================= EXPORT ================= */

module.exports = {
    syncVantageCustomers
};
