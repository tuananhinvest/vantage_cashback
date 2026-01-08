// transferController.js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { getBotInstance } = require('./telegramBotInstance');
const bot = getBotInstance();
const { loginVantage } = require('./loginVantage');
const { transferRebate, inputVerificationCode } = require('./transferRebate');
const { sendMessage } = require('./telegramAPI');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getTodayRejectCsvPath() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return path.join(
        __dirname,
        `rejected_${dd}-${mm}-${yyyy}.csv`
    );
}

function waitForOTP(chatId, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            bot.removeListener('message', onMessage);
            reject(new Error('⏰ Hết thời gian chờ mã code'));
        }, timeoutMs);

        function onMessage(msg) {
            if (msg.chat.id !== chatId) return;
            const code = msg.text?.trim();
            if (!code) return;

            clearTimeout(timer);
            bot.removeListener('message', onMessage);
            resolve(code);
        }

        bot.on('message', onMessage);
    });
}

/* ================= TRANSFER REJECT ================= */

async function startRebateTransferReject(chatId) {
    const csvPath = getTodayRejectCsvPath();

    // ===== 0. CHECK FILE CSV =====
    if (!fs.existsSync(csvPath)) {
        throw new Error(
            `❌ Không tìm thấy file TỪ CHỐI hôm nay:\n${path.basename(csvPath)}`
        );
    }

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox']
    });

    const page = await browser.newPage();

    try {
        // ===== 1. LOGIN =====
        await loginVantage(page);

        // ===== 2. UPLOAD CSV + GỬI MÃ =====
        await transferRebate(page, csvPath);

        // ===== 3. YÊU CẦU USER NHẬP OTP =====
        await sendMessage(
            chatId,
            '📧 *Vui lòng nhập mã xác nhận từ email để hoàn tiền TỪ CHỐI*',
            { parse_mode: 'Markdown' }
        );

        // ===== 4. CHỜ OTP =====
        const verificationCode = await waitForOTP(chatId);
        console.log('🔐 Nhận OTP:', verificationCode);

        // ===== 5. ĐIỀN OTP =====
        await inputVerificationCode(page, verificationCode);

        await sendMessage(
            chatId,
            '✅ *Đã submit hoàn tiền cho các lệnh TỪ CHỐI*',
            { parse_mode: 'Markdown' }
        );

    } catch (err) {
        console.error('❌ Lỗi hoàn tiền TỪ CHỐI:', err.message);

        await sendMessage(
            chatId,
            `❌ *Lỗi hoàn tiền TỪ CHỐI*\n${err.message}`,
            { parse_mode: 'Markdown' }
        );

        throw err;
    }

    await sleep(15000);
    await browser.close();
}

module.exports = {
    startRebateTransferReject
};
