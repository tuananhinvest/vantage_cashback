// telegramBot.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getBot } = require('./telegramBotInstance');
const bot = getBot(true); // bot chính khởi tạo polling
const { isUserAllowed } = require('./userAccess');
const { startRebateTransfer, startRebateTransferSingle } = require('./transferController');
const { checkFailedTransferHistory } = require('./getFailedTransferHistory');
const { startRebateTransferReject } = require('./transferRejectedController');
const { syncVantageCustomers } = require('./getUID');
const { runGetRebate } = require('./main');

function getTodayString() {
    const d = new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

let isRunning = false;

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    if (!isUserAllowed(msg)) {
        await bot.sendMessage(chatId, '❌ Bạn không có quyền.');
        return;
    }

    if (isRunning) {
        await bot.sendMessage(chatId, '⏳ Hệ thống đang chạy, vui lòng chờ...');
        return;
    }

    isRunning = true;

    await bot.sendMessage(
        chatId,
        '🚀 Bắt đầu lấy dữ liệu thưởng ngay bây giờ...',
        { parse_mode: 'Markdown' }
    );

    try {
        await runGetRebate();
    } catch (err) {
        await bot.sendMessage(chatId, `❌ Lỗi:\n${err.message}`);
    } finally {
        isRunning = false;
    }
});

// Log mọi message (tuỳ chọn)
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  console.log(`[${chatId}] ${text}`);
});

bot.onText(/\/thuong(\d+)?(?:@[\w_]+)?/, async (msg, match) => {
    const chatId = msg.chat.id;

    console.log('🔥 Nhận lệnh:', msg.text);

    if (!isUserAllowed(msg)) {
        await bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng lệnh này.');
        return;
    }

    const today = getTodayString();
    const part = match[1];

    let fileName;

    if (!part) {
        fileName = `${today}.csv`;
    } else {
        fileName = `${today}_part${part}.csv`;
    }

    const csvPath = path.join(__dirname, fileName);

    console.log('📂 File cần xử lý:', fileName);

    if (!fs.existsSync(csvPath)) {
        await bot.sendMessage(
            chatId,
            `⚠️ Không tìm thấy file: ${fileName}`
        );
        return;
    }

    await bot.sendMessage(
        chatId,
        `🚀 Đang xử lý file: ${fileName}`
    );

    try {
        await startRebateTransferSingle(chatId, csvPath);
    } catch (err) {
        console.error('❌ Lỗi transfer:', err);
        await bot.sendMessage(
            chatId,
            `❌ Lỗi:\n${err.message}`
        );
    }
});

bot.onText(/\/check/, async (msg) => {
    const chatId = msg.chat.id;

    if (!isUserAllowed(msg)) {
        await bot.sendMessage(chatId, '❌ Bạn không có quyền.');
        return;
    }

    await bot.sendMessage(chatId, '🔍 Đang kiểm tra lịch sử chuyển tiền...');

    try {
        const {
            rejectedRows,
            pendingRows,
            csvPath
        } = await checkFailedTransferHistory();

        if (rejectedRows.length > 0 && csvPath) {
            await bot.sendDocument(
                chatId,
                csvPath,
                {
                    caption: `❌ Có ${rejectedRows.length} lệnh TỪ CHỐI, click /return để hoàn lại`
                }
            );
        }

        if (pendingRows.length > 0) {
            const msgText = pendingRows.map(r =>
                `⚠️ Chưa thanh toán\n• TK: ${r.targetAccount}\n• ${r.amount}$`
            ).join('\n\n');

            await bot.sendMessage(chatId, msgText);
        }

        if (rejectedRows.length === 0 && pendingRows.length === 0) {
            await bot.sendMessage(
                chatId,
                '✅ Không có lệnh Từ chối / Chưa thanh toán hôm nay'
            );
        }

    } catch (err) {
        console.error(err);
        await bot.sendMessage(chatId, `❌ Lỗi: ${err.message}`);
    }
});

bot.onText(/\/return/, async (msg) => {
    const chatId = msg.chat.id;

    if (!isUserAllowed(msg)) {
        await bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng lệnh này.');
        return;
    }

    await bot.sendMessage(chatId, '🔁 *Bắt đầu hoàn tiền cho các lệnh TỪ CHỐI*', { parse_mode: 'Markdown' });

    try {
        await startRebateTransferReject(chatId);
    } catch (err) {
        console.error(err);
    }
});

bot.onText(/\/getuser/, async (msg) => {
    const chatId = msg.chat.id;

    if (!isUserAllowed(msg)) {
        await bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng lệnh này.');
        return;
    }

    if (isRunning) {
        await bot.sendMessage(chatId, '⏳ Hệ thống đang chạy tác vụ khác, vui lòng chờ...');
        return;
    }

    isRunning = true;

    await bot.sendMessage(chatId, '👥 *Bắt đầu đồng bộ tài khoản Vantage...*', { parse_mode: 'Markdown' });

    try {
        const result = await syncVantageCustomers();

        //await bot.sendMessage(
        //    chatId,
        //    `✅ *Đồng bộ hoàn tất*\n• Tổng tài khoản xử lý: ${result?.total || 'N/A'}`,
        //    { parse_mode: 'Markdown' }
        //);
    } catch (err) {
        console.error('❌ Lỗi /getuser:', err);
        await bot.sendMessage(chatId, `❌ Lỗi khi đồng bộ user:\n${err.message}`);
    } finally {
        isRunning = false;
    }
});
