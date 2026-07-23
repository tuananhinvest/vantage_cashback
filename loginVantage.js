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
    console.log('🧭 Kiểm tra và xử lý gợi ý hướng dẫn Vantage...');

    for (let i = 0; i < maxSteps; i++) {
        try {
            const popoverSelector = '#driver-popover-content';
            
            // Hạ timeout xuống 5s tránh bị treo lâu nếu không có popover
            await page.waitForSelector(popoverSelector, {
                timeout: 5000,
                visible: true
            });

            await sleep(1500);

            const clickResult = await page.evaluate((popoverId) => {
                const popover = document.querySelector(popoverId);
                if (!popover) return { success: false, reason: 'Không tìm thấy popover' };

                const buttons = popover.querySelectorAll('.driver-popover-navigation-btns button');
                
                for (let btn of buttons) {
                    const btnText = btn.textContent.trim();
                    if ((btnText === 'Bỏ qua' || btnText.toLowerCase().includes('skip')) && !btn.disabled) {
                        btn.click();
                        return { success: true, text: btnText, className: btn.className };
                    }
                }
                
                return { success: false, reason: 'Không tìm thấy nút "Bỏ qua" khả dụng' };
            }, popoverSelector);

            if (clickResult.success) {
                console.log(`⏭️ Đã click nút "${clickResult.text}" ở lần quét thứ ${i + 1}`);
            } else {
                console.log(`⚠️ ${clickResult.reason}`);
                break;
            }

            await sleep(2000);
            
        } catch (error) {
            console.log('ℹ️ Hoàn thành: Không còn popover hướng dẫn nào xuất hiện nữa.');
            break;
        }
    }
}

/* ================= SAFE GOTO ================= */
async function safeGotoUntilLoginPageReady(page, url, maxRetry = 10) {
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
        console.log(`🌐 Load trang (lần ${attempt})`);

        try {
            // Chờ networkidle2 để Javascript render hết khung UI Vue/React
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 60000,
            });

            // Chờ linh hoạt: Hoặc là ô nhập Username xuất hiện , hoặc Form Login xuất hiện 
            await Promise.race([
                page.waitForSelector('input[data-testid="userName_login"]', { visible: true, timeout: 20000 }),
                page.waitForSelector('[data-testid="login-form"]', { visible: true, timeout: 20000 })
            ]);

            console.log('✅ Trang login Vantage đã load xong form!');
            return true;

        } catch (err) {
            console.error(`⚠️ Trang chưa sẵn sàng (Lần ${attempt}): ${err.message}`);

            if (attempt === maxRetry) {
                throw new Error('❌ Không load được trang login Vantage sau nhiều lần thử');
            }

            await sleep(3000);

            try {
                await page.reload({
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
            } catch {}
        }
    }
}

/* ================= LOGIN ================= */
async function loginVantage(page) {

    await page.setExtraHTTPHeaders({
        'Accept-Language': 'vi-VN,vi;q=0.9'
    });

    // 1️⃣ Load trang
    await safeGotoUntilLoginPageReady(page, TARGET_URL, 10);

    await sleep(2000);

    // 2️⃣ Kiểm tra xem có ở trang Login không
    if (page.url().includes(LOGIN_KEYWORD)) {
        console.log('🔐 Tiến hành login mới');

        // Tìm và nhập Email 
        const userInput = await page.waitForSelector('input[data-testid="userName_login"]', { visible: true, timeout: 15000 });
        await userInput.click({ clickCount: 3 });
        await userInput.type(process.env.VANTAGE_EMAIL, { delay: 50 });

        // Tìm và nhập Password 
        const passInput = await page.waitForSelector('input[data-testid="password_login"]', { visible: true, timeout: 15000 });
        await passInput.click({ clickCount: 3 });
        await passInput.type(process.env.VANTAGE_PASSWORD, { delay: 50 });

        await sleep(1500);

        // Click Login với cơ chế retry 
        console.log('🔐 Bắt đầu nhấn nút đăng nhập...');
        
        const MAX_RETRIES = 5;
        let isNavigated = false;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`👉 Click nút Login lần thứ ${attempt}/${MAX_RETRIES}...`);
                
                await page.click('button[data-testid="login"]');

                // Chờ URL thay đổi (mất chữ /login)
                await page.waitForFunction(
                    (keyword) => !window.location.href.includes(keyword),
                    { timeout: 7000 },
                    LOGIN_KEYWORD
                );

                console.log('🎉 Đã chuyển trang thành công!');
                isNavigated = true;
                break;

            } catch (err) {
                console.warn(`⚠️ Lần click thứ ${attempt} chưa chuyển trang. Đang kiểm tra lại...`);
                
                if (!page.url().includes(LOGIN_KEYWORD)) {
                    console.log('🎉 Phát hiện URL đã thay đổi, dừng thử lại.');
                    isNavigated = true;
                    break;
                }

                if (attempt < MAX_RETRIES) {
                    await sleep(2000); 
                }
            }
        }

        if (!isNavigated) {
            throw new Error('❌ Đã thử click Login nhiều lần nhưng trang web không phản hồi hoặc không chuyển hướng.');
        }

        console.log('✅ Login thành công');
    }

    await sleep(4000);

    // 3️⃣ Skip guide
    await skipVantageGuides(page, 3);

    // 4️⃣ Đóng popup bằng ESC
    try {
        await page.keyboard.press('Escape');
    } catch {}

    await sleep(2000);

    await switchToVietnamese(page);

    // 5️⃣ Click "Yêu cầu chiết khấu"
    try {
        const applyBtn = await page.waitForSelector(
            '[data-testid="applyRebate"]',
            { visible: true, timeout: 10000 }
        );

        await applyBtn.evaluate(el => el.scrollIntoView({ block: 'center' }));
        await sleep(1000);

        await applyBtn.click();
        console.log('✅ Đã click "Yêu cầu chiết khấu"');
    } catch (err) {
        console.error('❌ Không click được "Yêu cầu chiết khấu":', err.message);
    }

    await sleep(3000);
    return true;
}

module.exports = { loginVantage };