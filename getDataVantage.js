const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config();
const { sendMessage, deleteMessage } = require('./telegramAPI');

const USER_ID = process.env.TELEGRAM_ID;

const TARGET_URL = 'https://ibportal.vtg-mkt-apac.com/rebatereport';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Hàm đợi trang load xong
async function waitForVantageLoaded(page, maxWaitMs = 180000) {
    console.log('⏳ Đang đợi trang Vantage load xong...');

    const start = Date.now();

    while (true) {
        const loadingVisible = await page.evaluate(() => {
            const spinner = document.querySelector('.el-loading-spinner');
            return spinner && spinner.offsetParent !== null;
        });

        if (!loadingVisible) {
            console.log('✅ Spinner biến mất → trang sẵn sàng');
            return;
        }

        if (Date.now() - start > maxWaitMs) {
            throw new Error('⏰ Timeout chờ spinner (> 3 phút)');
        }

        await sleep(1000); // ✅ THAY page.waitForTimeout
    }
}

async function gotoVantageWithRetry(
    page,
    url,
    maxRetry = 3,
    waitPerTryMs = 180000
) {
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
        try {
            console.log(`🌐 Load trang Vantage (lần ${attempt}/${maxRetry})`);

            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 120000
            });

            await skipVantageGuides(page, 3);

            await waitForVantageLoaded(page, waitPerTryMs);

            console.log('🎯 Trang load thành công');
            return;
        } catch (err) {
            console.warn(`⚠️ Load thất bại lần ${attempt}: ${err.message}`);

            if (attempt === maxRetry) {
                throw new Error(
                    '❌ Trang Vantage load thất bại sau 3 lần thử'
                );
            }

            console.log('🔄 Reload lại trang sau 5 giây...');
            await sleep(5000); // ✅ THAY page.waitForTimeout
        }
    }
}



function getLatestValidFile(dir) {
    const files = fs.readdirSync(dir)
        .map(name => {
            const fullPath = path.join(dir, name);
            const stat = fs.statSync(fullPath);
            return {
                name,
                fullPath,
                isFile: stat.isFile(),
                time: stat.mtime.getTime()
            };
        })
        .filter(f =>
            f.isFile &&
            !f.name.endsWith('.crdownload') &&
            (f.name.endsWith('.xlsx') || f.name.endsWith('.csv'))
        )
        .sort((a, b) => b.time - a.time);

    return files.length ? files[0] : null;
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
            await sleep(800);
        } catch {
            console.log('ℹ️ Không còn gợi ý để bỏ qua');
            break;
        }
    }
}

/* ================= MAIN ================= */

async function getRebateReport(page) {
    console.log('📊 Bắt đầu lấy Rebate Report');

    await gotoVantageWithRetry(page, TARGET_URL, 3, 180000);

    //await waitForVantageLoaded(page);

    await skipVantageGuides(page, 3);

    try {
        await page.keyboard.press('Escape');
        console.log('⌨️ Đã gửi ESC để đóng popup');
    } catch {}

    await sleep(5000);

    /* ===== 1. CHỌN THỜI GIAN ===== */
    try {
        const shortcutSelect = await page.waitForSelector(
            'div[data-testid="shortcut"]',
            { timeout: 100000 }
        );
        await sleep(10000);

        const selectBox = await shortcutSelect.boundingBox();
        if (!selectBox) throw new Error('Không lấy được box shortcut select');

        await page.mouse.click(
            selectBox.x + selectBox.width / 2,
            selectBox.y + selectBox.height / 2
        );
        await sleep(10000);

        await page.waitForSelector(
            'div.el-select-dropdown li.el-select-dropdown__item[data-testid="2"]',
            { timeout: 100000 }
        );

        const yesterdayItem = await page.$(
            'div.el-select-dropdown li.el-select-dropdown__item[data-testid="2"]'
        );

        const itemBox = await yesterdayItem.boundingBox();
        if (!itemBox) throw new Error('Không lấy được box item Hôm Qua');
        await sleep(30000);

        await page.mouse.click(
            itemBox.x + itemBox.width / 2,
            itemBox.y + itemBox.height / 2
        );
        await sleep(1500);

        console.log('📅 Đã chọn thời gian: Hôm Qua');
    } catch (err) {
        console.error(err);
        throw new Error('❌ Không chọn được thời gian (Hôm Qua)');
    }

    await sleep(4000);

    /* ===== 2. CLICK CẬP NHẬT ===== */
    try {
        const updateBtn = await page.waitForSelector(
            'button[data-testid="loading-button"]',
            { timeout: 10000 }
        );

        const box = await updateBtn.boundingBox();
        if (!box) throw new Error('Không lấy được bounding box nút CẬP NHẬT');

        await page.mouse.click(
            box.x + box.width / 2,
            box.y + box.height / 2
        );

        console.log('🔄 Đã click nút CẬP NHẬT');
        await waitForVantageLoaded(page, 60000);
    } catch (err) {
        console.error(err);
        throw new Error('❌ Không click được nút CẬP NHẬT');
    }

    /* ===== 3. CHUYỂN TAB TÀI KHOẢN ===== */
    try {
        await page.evaluate(() => window.scrollBy(0, 500));

        const switched = await page.evaluate(() => {
        const labels = ['Tài Khoản', 'Account'];
    
        const items = Array.from(document.querySelectorAll('.ht-switcher__item'));
        const tab = items.find(el => 
            labels.includes(el.innerText.trim())
        );
    
        if (tab) {
            tab.click();
            return true;
        }
        return false;
    });
    

        if (!switched) throw new Error('Không tìm thấy tab Tài Khoản');

        console.log('📂 Đã chuyển sang tab Tài Khoản');
        await sleep(2000);
        await waitForVantageLoaded(page, 60000);
    } catch (err) {
        console.error(err);
        throw new Error('❌ Không chuyển được sang tab Tài Khoản');
    }

    /* ===== 4. TẢI FILE (FIX CUỐI – DISPATCH EVENT) ===== */

    const DOWNLOAD_DIR = path.join(os.homedir(), 'Downloads');
    const TARGET_DIR = path.join(__dirname, 'vantage_data');

    if (!fs.existsSync(TARGET_DIR)) {
        fs.mkdirSync(TARGET_DIR, { recursive: true });
    }

    console.log('⬇️ Bắt đầu tải file rebate...');
    // ===== CLICK DOWNLOAD ĐƠN GIẢN =====

    // 1️⃣ Scroll xuống để nút download nằm trong viewport
    await page.evaluate(() => {
        const btn = document.querySelector(
            '.icon_wrapper > div.filter:not(.ht-drop-down)'
        );
        if (btn) {
            btn.scrollIntoView({ block: 'center' });
        }
    });
    
    console.log('📜 Đã cuộn tới nút download');
    
    // đợi UI ổn định
    await sleep(10000);
    
    // 2️⃣ Click nút download (CLICK WRAPPER, KHÔNG CLICK SVG)
    await page.click('.icon_wrapper > div.filter:not(.ht-drop-down)');
    
    console.log('⬇️ Đã click nút tải file');
        
    
    console.log('⏳ Đợi 15 giây để Chrome tải file...');
    await sleep(15000);

    /* 👉 CHỜ FILE XUẤT HIỆN */
    let downloadedFile = null;
    let retry = 0;

    while (!downloadedFile && retry < 20) {
        downloadedFile = getLatestValidFile(DOWNLOAD_DIR);
        await sleep(1000);
        retry++;
    }

    if (!downloadedFile) {
        throw new Error('❌ Không tìm thấy file rebate trong Downloads');
    }

    const targetPath = path.join(TARGET_DIR, downloadedFile.name);
    fs.copyFileSync(downloadedFile.fullPath, targetPath);

    await sleep(3000);

    console.log('✅ Đã copy file về:', targetPath);
    await sendMessage(USER_ID, 'Lấy dữ liệu thành công', {
          parse_mode: 'Markdown',
        });
    console.log('🎯 Hoàn tất bước lấy Rebate Report');
}

module.exports = {
    getRebateReport
};
