const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const XLSX = require('xlsx');
require('dotenv').config();
const cron = require('node-cron');

const { loginVantage } = require('./loginVantage');
const { insertCustomerIfNotExists, upsertReplaceAccount, deleteCentAccount } = require('./db');
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

async function runCentAccountMapping() {
    console.log('🚀 Bắt đầu scan Cent Account Mapping');

    const DOWNLOAD_DIR = path.join(os.homedir(), 'Downloads');

    // lấy file Excel mới nhất
    const files = fs.readdirSync(DOWNLOAD_DIR)
        .filter(f => f.endsWith('.xlsx') && !f.endsWith('.crdownload'))
        .map(name => ({
            name,
            fullPath: path.join(DOWNLOAD_DIR, name),
            time: fs.statSync(path.join(DOWNLOAD_DIR, name)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

    if (!files.length) {
        console.log('⚠️ Không có file Excel để scan Cent');
        return;
    }

    const excelPath = files[0].fullPath;
    console.log('📄 Dùng file:', files[0].name);

    const wb = XLSX.readFile(excelPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const totalMapped = await CentAccountMapping(rows);

    await sendMessage(
        USER_ID,
        `✅ Tìm và thay thế được ${totalMapped} tài khoản Standard STP Cent`
    );
}


/* ================= FIND & MAP CENT (USC) ================= */

function isWithinLastNDays(dateStr, days = 2) {
    if (!dateStr) return false;

    const created = new Date(dateStr);
    const now = new Date();
    const diffDays = (now - created) / (1000 * 60 * 60 * 24);

    return diffDays <= days;
}

async function CentAccountMapping(rows) {
    console.log('🔍 Dò tất cả tài khoản của user mới (2 ngày gần nhất)');

    const recentUsers = new Set();
    const userMap = new Map();

    // 1️⃣ TÌM USER TẠO TRONG 2 NGÀY
    for (let i = 1; i < rows.length; i++) {
        const createdAt = rows[i][0];              // A
        const userId = String(rows[i][1] || '').trim(); // B

        if (!userId) continue;

        if (isWithinLastNDays(createdAt, 2)) {
            recentUsers.add(userId);
        }
    }

    if (recentUsers.size === 0) {
        console.log('⚠️ Không có user mới trong 2 ngày');
        return 0;
    }

    console.log(`🆕 Tìm thấy ${recentUsers.size} user mới`);

    // 2️⃣ GOM TẤT CẢ ACCOUNT CỦA CÁC USER ĐÓ
    for (let i = 1; i < rows.length; i++) {
        const userId = String(rows[i][1] || '').trim();
        const account = String(rows[i][2] || '').trim();
        const currency = String(rows[i][9] || '').trim();

        if (!userId || !account || !currency) continue;
        if (!recentUsers.has(userId)) continue;

        if (!userMap.has(userId)) {
            userMap.set(userId, {
                usdAccounts: [],
                uscAccounts: []
            });
        }

        if (currency === 'USD') {
            userMap.get(userId).usdAccounts.push(account);
        }

        if (currency === 'USC') {
            userMap.get(userId).uscAccounts.push(account);
        }
    }

    // 3️⃣ MAP USC → USD + XOÁ CENT
    let totalMapped = 0;

    for (const [userId, data] of userMap.entries()) {
        if (!data.usdAccounts.length || !data.uscAccounts.length) continue;

        const usdAccount = data.usdAccounts[0];

        for (const uscAccount of data.uscAccounts) {
            await upsertReplaceAccount(uscAccount, usdAccount);
            await deleteCentAccount(uscAccount);

            totalMapped++;

            console.log(
                `🔁 MAP USC → USD | User ${userId}: ${uscAccount} → ${usdAccount}`
            );
        }
    }

    console.log(`✅ Hoàn tất xử lý ${totalMapped} tài khoản USC`);
    return totalMapped;
}



cron.schedule(
    '30 9 * * *',
    async () => {
        console.log('⏰ Cron kích hoạt CentAccountMapping (09:15)');
        await runCentAccountMapping();
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
);

/* ================= CRON ================= */

cron.schedule(
    '15 9 * * *',
    async () => {
        console.log('⏰ Cron kích hoạt get UID');
        await syncVantageCustomers();
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
);

/* ================= EXPORT ================= */

module.exports = {
    syncVantageCustomers, CentAccountMapping
};
