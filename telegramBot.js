// telegramBot.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getBot } = require('./telegramBotInstance');
const bot = getBot(true); // bot chính khởi tạo polling
const { isUserAllowed } = require('./userAccess');
const { startRebateTransfer } = require('./transferController');
const { checkFailedTransferHistory } = require('./getFailedTransferHistory');


function getTodayString() {
    const d = new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Log mọi message (tuỳ chọn)
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  console.log(`[${chatId}] ${text}`);
});

bot.onText(/\/thuong/, async (msg) => {
    const chatId = msg.chat.id;

    if (!isUserAllowed(msg)) {
        await bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng lệnh này.');
        return;
    }

    const today = getTodayString();
    const csvPath = path.join(__dirname, `${today}.csv`);

    // ===== CHECK FILE CSV =====
    if (!fs.existsSync(csvPath)) {
        await bot.sendMessage(
            chatId,
            '⚠️ *Chưa có file thưởng ngày hôm nay*\n\n👉 Gõ `/start` để bắt đầu lấy dữ liệu',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    await bot.sendMessage(
        chatId,
        '✅ *Đã tìm thấy dữ liệu thưởng ngày hôm nay*\n🚀 Bắt đầu chuyển tiền...',
        { parse_mode: 'Markdown' }
    );

    // ===== TIẾP TỤC FLOW =====
    try {
        await startRebateTransfer(chatId);
    } catch (err) {
        console.error(err);
        await bot.sendMessage(
            chatId,
            `❌ Lỗi khi chuyển tiền:\n${err.message}`
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
                    caption: `❌ Có ${rejectedRows.length} lệnh TỪ CHỐI`
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
