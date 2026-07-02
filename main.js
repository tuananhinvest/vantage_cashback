const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
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
    console.log('🚀 Bắt đầu chạy lấy thưởng (Chế độ Stealth Mode)');

    const browser = await puppeteer.launch({
        headless: false, // Bắt buộc phải để false khi vượt Cloudflare
        defaultViewport: null,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--start-maximized",
            // Thêm các cờ giúp giảm tỷ lệ bị Cloudflare nghi ngờ
            "--disable-blink-features=AutomationControlled", 
            "--lang=vi-VN,vi"
        ],
    });

    const page = await browser.newPage();

    // Loại bỏ hoàn toàn thuộc tính webdriver ngầm
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    try {
        await sendMessage(USER_ID, '🔫 Bắt đầu lấy dữ liệu thưởng sàn Vantage');

        await loginVantage(page);
        await sleep(3000);

        await getRebateReport(page);
        await processRebate();

        await sendMessage(USER_ID, '✅ Lấy dữ liệu thưởng thành công');
    } catch (err) {
        console.error('❌ Lỗi runGetRebate:', err.message);
        await sendMessage(USER_ID, `❌ Lỗi khi lấy dữ liệu thưởng, click /start để bắt đầu lại`);
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
