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

// Hàm đợi trang load xong (chờ Spinner biến mất)
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

        await sleep(1000);
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
            await sleep(5000);
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
    console.log('🧭 Kiểm tra và xử lý gợi ý hướng dẫn Vantage...');

    for (let i = 0; i < maxSteps; i++) {
        try {
            const popoverSelector = '#driver-popover-content';
            await page.waitForSelector(popoverSelector, {
                timeout: 3000,
                visible: true
            });

            await sleep(300);

            const clickResult = await page.evaluate((popoverId) => {
                const popover = document.querySelector(popoverId);
                if (!popover) return { success: false, reason: 'Không tìm thấy popover' };

                const buttons = popover.querySelectorAll('.driver-popover-navigation-btns button');
                
                for (let btn of buttons) {
                    const btnText = btn.textContent.trim();
                    
                    if (btnText === 'Bỏ qua' && !btn.disabled) {
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

            await sleep(1200);
            
        } catch (error) {
            console.log('ℹ️ Hoàn thành: Không còn popover hướng dẫn nào xuất hiện nữa.');
            break;
        }
    }
}

/* ================= CORE INTERNAL LOGIC ================= */

async function executeGetRebateReport(page) {
    await gotoVantageWithRetry(page, TARGET_URL, 3, 180000);

    await skipVantageGuides(page, 3);

    try {
        await page.keyboard.press('Escape');
        console.log('⌨️ Đã gửi ESC để đóng popup');
    } catch {}

    await sleep(2000);

    /* ===== 1. CHỌN THỜI GIAN ===== */
    console.log('📅 Đang tiến hành chọn thời gian (Hôm Qua)...');

    // 1. Chờ và click trực tiếp mở Dropdown Select
    const shortcutSelector = 'div[data-testid="shortcut"]';
    await page.waitForSelector(shortcutSelector, { timeout: 60000, visible: true });

    // Click mở ô Dropdown bằng cách kích hoạt sự kiện DOM trực tiếp (đảm bảo 100% menu xổ ra)
    await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.click();
    }, shortcutSelector);

    await sleep(1500); // Chờ menu xổ ra & animation hoàn tất

    // 2. Chờ và click chọn mục "Hôm qua" (data-testid="2")
    const optionSelector = 'div.el-select-dropdown li.el-select-dropdown__item[data-testid="2"]';

    // Thử tìm selector option (cho phép chọn kể cả khi chưa visible hoàn toàn trong viewport)
    await page.waitForSelector(optionSelector, { timeout: 30000 });

    // Click trực tiếp vào Item bằng JavaScript
    const clickedOption = await page.evaluate((optSel) => {
        const item = document.querySelector(optSel);
        if (item) {
            item.click();
            return true;
        }
        return false;
    }, optionSelector);

    if (!clickedOption) {
        throw new Error('Không thể click vào item "Hôm Qua" [data-testid="2"]');
    }

    console.log('📅 Đã chọn thời gian: Hôm Qua');
    await sleep(2000);

    /* ===== 2. CLICK CẬP NHẬT ===== */
    const updateBtn = await page.waitForSelector(
        'button[data-testid="loading-button"]',
        { timeout: 15000, visible: true }
    );

    const box = await updateBtn.boundingBox();
    if (!box) throw new Error('Không lấy được bounding box nút CẬP NHẬT');

    await page.mouse.click(
        box.x + box.width / 2,
        box.y + box.height / 2
    );

    console.log('🔄 Đã click nút CẬP NHẬT');
    await waitForVantageLoaded(page, 60000);

    /* ===== 3. CHUYỂN TAB TÀI KHOẢN ===== */
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

    /* ===== 4. TẢI FILE ===== */
    const DOWNLOAD_DIR = path.join(os.homedir(), 'Downloads');
    const TARGET_DIR = path.join(__dirname, 'vantage_data');

    if (!fs.existsSync(TARGET_DIR)) {
        fs.mkdirSync(TARGET_DIR, { recursive: true });
    }

    console.log('⬇️ Bắt đầu tải file rebate...');

    // Scroll xuống nút download
    await page.evaluate(() => {
        const btn = document.querySelector(
            '.icon_wrapper > div.filter:not(.ht-drop-down)'
        );
        if (btn) {
            btn.scrollIntoView({ block: 'center' });
        }
    });

    console.log('📜 Đã cuộn tới nút download');
    await sleep(2000);

    // Click nút download
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

/* ================= MAIN FUNCTION WITH RETRY ================= */

async function getRebateReport(page, maxAttempts = 3) {
    console.log('📊 Bắt đầu quy trình lấy Rebate Report');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`\n-----------------------------------------`);
            console.log(`🔄 Thử thực thi getRebateReport (Lần ${attempt}/${maxAttempts})`);
            console.log(`-----------------------------------------`);

            // Chạy toàn bộ logic chính
            await executeGetRebateReport(page);

            // Nếu chạy tới đây thành công thì thoát hàm
            return;

        } catch (err) {
            console.error(`❌ Lỗi ở lần thử ${attempt}: ${err.message}`);

            if (attempt === maxAttempts) {
                console.error(`💥 Đã thử lại tối đa ${maxAttempts} lần nhưng vẫn thất bại!`);
                throw err; // Quăng lỗi lên cho hàm gọi ngoài xử lý
            }

            console.log(`⚠️ Đang tải lại (reload) trang để thử lại sau 5 giây...`);
            await sleep(5000);

            try {
                // Tải lại trang hiện tại hoặc nhảy lại vào URL
                await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
            } catch (reloadErr) {
                console.warn(`⚠️ Reload thất bại, sẽ dùng goto lại trang ở lần thử tiếp theo: ${reloadErr.message}`);
            }
        }
    }
}

module.exports = {
    getRebateReport
};