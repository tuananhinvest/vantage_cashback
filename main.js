const puppeteer = require('puppeteer');
const cron = require('node-cron');
require('dotenv').config();

const { loginVantage } = require('./loginVantage');
const { getRebateReport } = require('./getDataVantage');
const { processRebate } = require('./processRebate');
const { sendMessage } = require('./telegramAPI');

const USER_ID = process.env.TELEGRAM_ID;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* ================= CORE FUNCTION ================= */

async function runGetRebate() {
    console.log('🚀 Bắt đầu chạy lấy thưởng');

    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: [
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-setuid-sandbox",
            "--no-first-run",
            "--no-zygote",
            "--start-maximized",
            "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        ],
        defaultViewport: null,
    });

    const page = await browser.newPage();

    try {
        await sendMessage(USER_ID, '🔫 Bắt đầu lấy dữ liệu thưởng sàn Vantage');

        await loginVantage(page);
        await sleep(3000);

        await getRebateReport(page);
        await processRebate();

        await sendMessage(USER_ID, '✅ Lấy dữ liệu thưởng thành công');
    } catch (err) {
        console.error('❌ Lỗi runGetRebate:', err.message);
        await sendMessage(
            USER_ID,
            `❌ Lỗi khi lấy dữ liệu thưởng, click /start để bắt đầu lại`
        );
        throw err;
    } finally {
        await sleep(10000);
        await browser.close();
    }
}

/* ================= CRON ================= */

cron.schedule(
    '59 9 * * *',
    async () => {
        console.log('⏰ Cron kích hoạt runGetRebate');
        await runGetRebate();
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
);

/* ================= EXPORT ================= */

module.exports = {
    runGetRebate
};
