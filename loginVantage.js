const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { sendMessage, deleteMessage } = require('./telegramAPI');

const TARGET_URL = 'https://ibportal.vtg-mkt-apac.com/rebatereport';
const LOGIN_KEYWORD = '/login';
const COOKIE_PATH = path.join(__dirname, '../cookies/vantage.json');
const USER_ID = process.env.TELEGRAM_ID;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* ================= COOKIE ================= */

async function loadCookies(page) {
    if (fs.existsSync(COOKIE_PATH)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
        if (cookies.length) {
            await page.setCookie(...cookies);
            console.log('🍪 Đã load cookies');
            return true;
        }
    }
    console.log('🍪 Không có cookies');
    return false;
}

async function saveCookies(page) {
    const cookies = await page.cookies();
    fs.mkdirSync(path.dirname(COOKIE_PATH), { recursive: true });
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
    console.log('💾 Cookies đã được lưu');
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

/* ================= LOGIN ================= */

async function loginVantage(page) {

    // 1️⃣ Load cookie
    await loadCookies(page);

    // 2️⃣ Vào trang report
    await page.goto(TARGET_URL, {
        waitUntil: 'networkidle2',
        timeout: 120000
    });

    // 3️⃣ Cookie còn sống
    if (!page.url().includes(LOGIN_KEYWORD)) {
        console.log('✅ Đã đăng nhập (cookie còn hiệu lực)');
        await saveCookies(page); // refresh giống code cũ
        return true;
    }

    console.log('🔐 Cookie hết hạn → tiến hành login');

    // 4️⃣ Login
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

    await Promise.all([
        page.click('button[data-testid="login"]'),
        page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);

    console.log('✅ Login thành công');

    // 5️⃣ Lưu cookie NGAY
    await saveCookies(page);

    // 6️⃣ Skip guide
    await skipVantageGuides(page, 3);

    // 7️⃣ Đóng popup bằng ESC
    try {
        await page.keyboard.press('Escape');
        console.log('⌨️ Đã gửi ESC để đóng popup');
    } catch {}

    // 8️⃣ Click "Nhận Hoa Hồng"
    try {
        console.log('💰 Đang click "Nhận Hoa Hồng"...');
    
        const applyBtn = await page.waitForSelector(
            'button[data-testid="applyRebate"]',
            { visible: true, timeout: 15000 }
        );
    
        // scroll chắc chắn vào viewport
        await applyBtn.evaluate(el =>
            el.scrollIntoView({ block: 'center' })
        );
    
        // đợi UI ổn định
        await new Promise(r => setTimeout(r, 800));
    
        const box = await applyBtn.boundingBox();
        if (!box) {
            throw new Error('Không lấy được boundingBox nút Nhận Hoa Hồng');
        }

        await sleep(2000);
    
        // native mouse click
        await page.mouse.move(
            box.x + box.width / 2,
            box.y + box.height / 2
        );
        await page.mouse.down();
        await page.mouse.up();
    
        console.log('✅ Đã click "Nhận Hoa Hồng"');
    
    } catch (err) {
        console.error('❌ Không click được "Nhận Hoa Hồng":', err.message);
    }

    await sleep(7000);

    console.log('🎯 Login Vantage hoàn tất');
    await sendMessage(USER_ID, 'Đăng nhập Vantage thành công!', {
        parse_mode: 'Markdown'
    });

    return true;
}

module.exports = { loginVantage };
