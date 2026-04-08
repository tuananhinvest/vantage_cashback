const TARGET_URL = 'https://ibportal.vtg-mkt-apac.com/rebateTransfer';
const fs = require('fs');
const path = require('path');

require('dotenv').config();
const { sendMessage } = require('./telegramAPI');
const USER_ID = process.env.TELEGRAM_ID;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function inputVerificationCode(page, code) {
    console.log('⌨️ Đang nhập mã code xác minh');

    const input = await page.waitForSelector(
        'input[data-testid="code"]',
        { timeout: 15000 }
    );

    await input.click({ clickCount: 3 });
    await input.type(code, { delay: 80 });

    console.log('✅ Đã nhập mã code');
    await sendMessage(
            USER_ID,
            '✅ Đã nhập mã code thành công, đang thực hiện chuyển tiền',
            { parse_mode: 'Markdown' }
        );

    // ===== CLICK "TÔI ĐỒNG Ý" (FIX CHUẨN) =====
    console.log('☑️ Đang tick "Tôi đồng ý"...');
    const agreeResult = await page.evaluate(() => {
        const checkbox = document.querySelector('.ht-protocol__checkbox');
        if (!checkbox) return 'NOT_FOUND';
    
        checkbox.scrollIntoView({ block: 'center' });
    
        // Dispatch đầy đủ event để Vue nhận
        ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => {
            checkbox.dispatchEvent(
                new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: window
                })
            );
        });
    });
    console.log('✅ Đã tick "Tôi đồng ý"');
    // đợi Vue cập nhật nút submit
    await sleep(1500);
        
    /* ================= CLICK NÚT GỬI ================= */
    console.log('📨 Chuẩn bị click nút GỬI (native mouse)...');
    // lấy wrapper (KHÔNG phải button)
    const submitWrapper = await page.waitForSelector(
        '.submitBtn_block',
        { timeout: 15000 }
    );
    await sleep(500);
    
    // lấy bounding box
    const box = await submitWrapper.boundingBox();
    
    if (!box) {
        throw new Error('❌ Không lấy được bounding box nút GỬI');
    }
    
    // CLICK BẰNG NATIVE MOUSE
    await page.mouse.move(
        box.x + box.width / 2,
        box.y + box.height / 2
    );
    
    await page.mouse.down();
    await page.mouse.up();
    console.log('🚀 ĐÃ CLICK NÚT GỬI (native mouse)');
    
    // đợi popup xác nhận render
    await sleep(2000);
    
    console.log('⚠️ Đang xác nhận popup cuối...');
    const confirmResult = await page.evaluate(() => {
        const buttons = Array.from(
            document.querySelectorAll('button.el-button.ht-dialog__primary-button')
        );
    
        const confirmBtn = buttons.find(btn =>
            btn.innerText.includes('XÁC NHẬN')
        );
    
        if (!confirmBtn) return 'NOT_FOUND';
    
        confirmBtn.scrollIntoView({ block: 'center' });
    
        ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => {
            confirmBtn.dispatchEvent(
                new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: window
                })
            );
        });
    
        return 'CLICKED';
    });
    
    console.log('🎉 Đã xác nhận chuyển tiền');
}

async function transferRebate(page, csvPath) {
    console.log('💸 Vào trang chuyển hoàn tiền');

    await page.goto(TARGET_URL, {
        waitUntil: 'networkidle2',
        timeout: 120000
    });

    try {
        await page.keyboard.press('Escape');
        console.log('⌨️ Đã gửi ESC để đóng popup');
    } catch {}

    await sleep(2000);

    // ===== 1. CLICK TAB "CHUYỂN HOÀN TIỀN CHO NGƯỜI KHÁC" =====
    console.log('🧭 Đang chọn tab "Chuyển hoàn tiền cho người khác"...');
    const clicked = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('.el-tabs__item'));
        const target = tabs.find(el =>
            el.innerText.includes('Chuyển hoàn tiền cho người khác')
        );
    
        if (!target) return false;
    
        target.scrollIntoView({ block: 'center' });
        target.click();
        return true;
    });

    if (!clicked) {
        throw new Error('❌ Không click được tab "Chuyển hoàn tiền cho người khác"');
    }

    console.log('✅ Đã click tab "Chuyển hoàn tiền cho người khác"');

    // ===== 2. UPLOAD FILE CSV =====
    console.log('📤 Bắt đầu upload file CSV');
    
    // đảm bảo tab đã render xong
    await sleep(2000);
    
    // lấy input file (KHÔNG check visible)
    const fileInput = await page.waitForSelector(
        'input[type="file"][accept=".csv"]',
        { timeout: 15000 }
    );
    
    // upload file
    await fileInput.uploadFile(csvPath);
    console.log('✅ Đã upload file CSV:', csvPath);
    // đợi hệ thống xử lý file
    await sleep(3000);

    // ===== GỬI MÃ CODE =====
    console.log('📨 Chuẩn bị gửi mã code xác minh');
    
    // scroll xuống cuối trang
    await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
    });
    
    await sleep(1500);
    
    // click nút "Gửi mã code"
    const sent = await page.evaluate(() => {
        const btn = document.querySelector('button[data-testid="code-button"]');
        if (!btn) return false;
        btn.scrollIntoView({ block: 'center' });
        btn.click();
        return true;
    });
    
    if (!sent) {
        throw new Error('❌ Không click được nút Gửi mã code');
    }
    
    console.log('✅ Đã click Gửi mã code');
}

module.exports = {
    transferRebate,
    inputVerificationCode
};
