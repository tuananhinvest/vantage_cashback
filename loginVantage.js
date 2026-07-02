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
            // 1. Chờ cái khung Popover tổng xuất hiện
            const popoverSelector = '#driver-popover-content';
            await page.waitForSelector(popoverSelector, {
                timeout: 30000,
                visible: true
            });

            // Đợi một chút ngắn để popup render xong hoàn toàn text
            await new Promise(resolve => setTimeout(resolve, 5000));

            // 2. Chọc vào nội dung để tìm nút có chữ "Bỏ qua"
            const clickResult = await page.evaluate((popoverId) => {
                const popover = document.querySelector(popoverId);
                if (!popover) return { success: false, reason: 'Không tìm thấy popover' };

                // Lấy tất cả các nút bấm có thể click được trong footer điều hướng
                const buttons = popover.querySelectorAll('.driver-popover-navigation-btns button');
                
                for (let btn of buttons) {
                    const btnText = btn.textContent.trim();
                    
                    // Nếu tìm thấy nút chứa chữ "Bỏ qua" và nút đó KHÔNG bị disabled
                    if (btnText === 'Bỏ qua' && !btn.disabled) {
                        btn.click(); // Click bằng JS thuần
                        return { success: true, text: btnText, className: btn.className };
                    }
                }
                
                return { success: false, reason: 'Không tìm thấy nút "Bỏ qua" khả dụng' };
            }, popoverSelector);

            if (clickResult.success) {
                console.log(`⏭️ Đã click nút "${clickResult.text}" (Class: ${clickResult.className.split(' ')[0]}) ở lần quét thứ ${i + 1}`);
            } else {
                console.log(`⚠️ ${clickResult.reason}`);
                break;
            }

            // Đợi 1.2 giây để popup đóng hẳn và DOM ổn định trước khi quét lượt tiếp theo
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.log('ℹ️ Hoàn thành: Không còn popover hướng dẫn nào xuất hiện nữa.');
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

    // 1️⃣ Load trang
    await safeGotoUntilLoginPageReady(page, TARGET_URL, 10);

    await sleep(5000);

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

        // --- ĐOẠN CODE SỬA LẠI: CLICK THỬ LẠI TỐI ĐA 4 LẦN ---
        console.log('🔐 Bắt đầu nhấn nút đăng nhập...');
        
        const MAX_RETRIES = 5; // Số lần click tối đa
        let isNavigated = false;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`👉 Click nút Login lần thứ ${attempt}/${MAX_RETRIES}...`);
                
                // Thực hiện click vào nút login
                await page.click('button[data-testid="login"]');

                // Chờ 5 giây để xem trang có bắt đầu chuyển hướng hay không
                // Nếu trang chuyển hướng thành công, URL sẽ không còn chứa LOGIN_KEYWORD nữa
                await page.waitForFunction(
                    (keyword) => !window.location.href.includes(keyword),
                    { timeout: 7000 }, // Đợi tối đa 5 giây cho mỗi lần click
                    LOGIN_KEYWORD
                );

                // Nếu chạy tới đây tức là waitForFunction thành công -> Đã qua trang mới!
                console.log('🎉 Đã chuyển trang thành công!');
                isNavigated = true;
                break; // Thoát khỏi vòng lặp click, không bấm nữa

            } catch (err) {
                console.warn(`⚠️ Lần click thứ ${attempt} thất bại hoặc trang chưa kịp chuyển hướng. Chờ chút...`);
                
                // Kiểm tra lại một lần nữa bằng url thực tế cho chắc chắn
                if (!page.url().includes(LOGIN_KEYWORD)) {
                    console.log('🎉 Phát hiện URL đã thay đổi, dừng thử lại.');
                    isNavigated = true;
                    break;
                }

                // Nghỉ 1.5 giây trước khi bấm lại phát tiếp theo
                if (attempt < MAX_RETRIES) {
                    await sleep(1500); 
                }
            }
        }

        // Nếu qua 4 lần bấm mà vẫn kẹt ở trang login thì báo lỗi dừng chương trình
        if (!isNavigated) {
            throw new Error('❌ Đã thử click Login 4 lần nhưng trang web không phản hồi hoặc không chuyển hướng.');
        }



        //await Promise.all([
        //    page.click('button[data-testid="login"]'),
        //    page.waitForNavigation({ 
        //        waitUntil: 'domcontentloaded', // Chỉ đợi HTML load xong
        //        timeout: 60000 
        //    })
        //]);

        console.log('✅ Login thành công');
    }

    await sleep(5000);

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
            '[data-testid="applyRebate"]',
            { visible: true, timeout: 10000 }
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
