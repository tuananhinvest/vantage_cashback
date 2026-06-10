const fs = require('fs');
require('dotenv').config();
const { sendMessage } = require('./telegramAPI');

const TARGET_URL = 'https://ibportal.vtg-mkt-apac.com/';
const LOGIN_KEYWORD = '/login';
const USER_ID = process.env.TELEGRAM_ID;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function switchToVietnamese(page) {
    try {
        console.log('🌐 Đang mở menu ngôn ngữ...');

        // 1️⃣ Click icon quả cầu ngôn ngữ
        const opened = await page.evaluate(() => {
            const btn = document.querySelector('div.lang[role="button"]');
            if (btn) {
                btn.scrollIntoView({ block: 'center' });
                btn.click();
                return true;
            }
            return false;
        });

        if (!opened) {
            throw new Error('Không tìm thấy nút chuyển ngôn ngữ');
        }

        await sleep(1000);

        // 2️⃣ Chọn "Tiếng Việt" hoặc "Vietnamese"
        const selected = await page.evaluate(() => {
            const keywords = ['tiếng việt', 'vietnamese'];

            const items = Array.from(document.querySelectorAll('span'));
            const lang = items.find(el => {
                const text = (el.innerText || '').toLowerCase().trim();
                return keywords.includes(text);
            });

            if (lang) {
                lang.scrollIntoView({ block: 'center' });
                lang.click();
                return true;
            }
            return false;
        });

        if (!selected) {
            throw new Error('Không tìm thấy tùy chọn Tiếng Việt');
        }

        console.log('🇻🇳 Đã chuyển sang Tiếng Việt');
        await sleep(2000);
        return true;

    } catch (err) {
        console.error('❌ Lỗi switchToVietnamese:', err.message);
        return false;
    }
}



/* ================= GUIDE ================= */

async function skipVantageGuides(page, maxSteps = 3) {
    console.log('🧭 Kiểm tra gợi ý hướng dẫn Vantage...');

    for (let i = 0; i < maxSteps; i++) {
        try {
            await page.waitForSelector('button.driver-close-btn', {
                timeout: 3000,
                visible: true
            });
            await page.click('button.driver-close-btn');
            console.log(`⏭️ Đã bỏ qua gợi ý lần ${i + 1}`);
            await page.waitForTimeout(800);
        } catch {
            console.log('ℹ️ Không còn gợi ý để bỏ qua');
            break;
        }
    }
}

/* ================= SAFE GOTO ================= */
async function safeGotoUntilLoginPageReady(page, url, maxRetry = 15) {
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
        console.log(`🌐 Load trang (lần ${attempt})`);

        try {
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 90000,
            });

            // 🧠 ĐỢI LOGO VANTAGE (DẤU HIỆU TRANG LOGIN LOAD THẬT)
            await page.waitForSelector(
                'div.login-logo-wrapper img',
                { timeout: 10000 }
            );

            console.log('✅ Trang login Vantage load thành công (logo đã xuất hiện)');
            return true;

        } catch (err) {
            console.error(`⚠️ Trang chưa sẵn sàng: ${err.message}`);

            if (attempt === maxRetry) {
                throw new Error(
                    '❌ Không load được trang login Vantage sau nhiều lần thử'
                );
            }

            await sleep(3000);

            try {
                await page.reload({
                    waitUntil: 'domcontentloaded',
                    timeout: 60000
                });
            } catch {}
        }
    }
}


/* ================= LOGIN ================= */
async function loginVantage(page) {

    // ✅ ÉP NGÔN NGỮ TIẾNG VIỆT
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'vi-VN,vi;q=0.9'
    });

    //await page.evaluateOnNewDocument(() => {
    //    Object.defineProperty(navigator, 'language', {
    //        get: () => 'vi-VN'
    //    });
    //    Object.defineProperty(navigator, 'languages', {
    //        get: () => ['vi-VN', 'vi']
    //    });
    //});

    // 1️⃣ Load trang
    await safeGotoUntilLoginPageReady(page, TARGET_URL, 10);

    await sleep(2000);

    // 2️⃣ Nếu chưa login → login mới
    if (page.url().includes(LOGIN_KEYWORD)) {
        console.log('🔐 Tiến hành login mới');

        await page.waitForSelector('input[data-testid="userName_login"]', {
            visible: true
        });

        await page.type(
            'input[data-testid="userName_login"]',
            process.env.VANTAGE_EMAIL,
            { delay: 50 }
        );

        await page.type(
            'input[data-testid="password_login"]',
            process.env.VANTAGE_PASSWORD,
            { delay: 50 }
        );

        await sleep(2000);

        await Promise.all([
            page.click('button[data-testid="login"]'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        console.log('✅ Login thành công');
    }

    // 3️⃣ Skip guide
    await skipVantageGuides(page, 3);

    // 4️⃣ Đóng popup bằng ESC
    try {
        await page.keyboard.press('Escape');
    } catch {}

    await sleep(3000);

    await switchToVietnamese(page);

    // 5️⃣ Click "Yêu cầu chiết khấu"
    try {
        const applyBtn = await page.waitForSelector(
            'button[data-testid="applyRebate"]',
            { visible: true, timeout: 15000 }
        );

        await applyBtn.evaluate(el =>
            el.scrollIntoView({ block: 'center' })
        );

        await sleep(1500);

        const box = await applyBtn.boundingBox();
        if (!box) throw new Error('No boundingBox');

        await page.mouse.move(
            box.x + box.width / 2,
            box.y + box.height / 2
        );
        await page.mouse.click(
            box.x + box.width / 2,
            box.y + box.height / 2
        );

        console.log('✅ Đã click "Yêu cầu chiết khấu"');
    } catch (err) {
        console.error('❌ Không click được "Yêu cầu chiết khấu":', err.message);
    }

    await sleep(3000);

    //await sendMessage(USER_ID, '✅ Đăng nhập Vantage thành công', {
    //    parse_mode: 'Markdown'
    //});

    return true;
}

module.exports = { loginVantage };
