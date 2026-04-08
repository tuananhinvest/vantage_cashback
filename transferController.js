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

async function startRebateTransferSingle(chatId, csvPath) {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox']
    });

    const page = await browser.newPage();

    try {
        // ===== LOGIN =====
        await loginVantage(page);

        // ===== UPLOAD FILE =====
        await transferRebate(page, csvPath);

        await sleep(3000);

        try { await page.keyboard.press('Escape'); } catch {}
        await sleep(2000);

        // ===== YÊU CẦU OTP =====
        await sendMessage(
            chatId,
            '📧 *Nhập mã OTP từ email*',
            { parse_mode: 'Markdown' }
        );

        const verificationCode = await waitForOTP(chatId);

        console.log('🔐 OTP:', verificationCode);

        // ===== INPUT OTP =====
        await inputVerificationCode(page, verificationCode);

        await sleep(5000);

        await sleep(2*60*1000);
        await sendMessage(chatId,'✅ Chuyển tiền thành công',{ parse_mode: 'Markdown' });

    } catch (err) {
        throw err;
    }

    await browser.close();
}

async function startRebateTransfer(chatId) {
    const today = new Date().toISOString().slice(0, 10);
    const csvPath = path.join(__dirname, `${today}.csv`);

    // ===== 0. CHECK FILE CSV =====
    if (!fs.existsSync(csvPath)) {
        throw new Error(`Không tìm thấy file CSV hôm nay: ${today}.csv`);
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

        // ===== 2. UPLOAD CSV + CLICK GỬI MÃ =====
        await transferRebate(page, csvPath);

        await sleep(3000);

        // 4️⃣ Đóng popup bằng ESC
        try {
            await page.keyboard.press('Escape');
        } catch {}
    
        await sleep(3000);

        // ===== 3. YÊU CẦU USER NHẬP CODE =====
        await sendMessage(chatId,'📧 *Vui lòng nhập mã code từ email*',{ parse_mode: 'Markdown' });

        // ===== 4. CHỜ USER GỬI CODE =====
        const verificationCode = await waitForOTP(chatId);
        console.log('🔐 Nhận được mã code:', verificationCode);

        // ===== 5. ĐIỀN CODE VÀO WEB =====
        await inputVerificationCode(page, verificationCode);

        // Bước submit cuối 
        await sleep(2*60*1000);
        await sendMessage(chatId,'✅ Chuyển tiền thành công',{ parse_mode: 'Markdown' });


    } catch (err) {
        console.error('❌ Lỗi chuyển tiền:', err.message);
        await sendMessage(chatId, `❌ *Lỗi chuyển tiền*\n${err.message}`, { parse_mode: 'Markdown' });  
        throw err;
    }

    await sleep(10*1000);

    browser.close();
    // KHÔNG đóng browser để user còn confirm / debug
}

module.exports = {
    startRebateTransfer, startRebateTransferSingle
};
