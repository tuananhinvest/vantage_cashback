const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { connect } = require('puppeteer-real-browser');
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
    console.log('🚀 Bắt đầu chạy lấy thưởng (Chế độ Real Browser)');

    const { browser, page } = await connect({
        headless: false,
        turnstile: true, // Tự động xử lý tích chọn ô Cloudflare Turnstile
        args: ['--start-maximized',"--no-sandbox","--disable-setuid-sandbox",],
        connectOption: { defaultViewport: null }
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
        await sendMessage(USER_ID, `❌ Lỗi khi lấy dữ liệu thưởng`);
        throw err;
    } finally {
        await sleep(5000);
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
