// telegramBot.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getBot } = require('./telegramBotInstance');
const bot = getBot(true); // bot chính khởi tạo polling
const { isUserAllowed } = require('./userAccess');
const { startRebateTransfer } = require('./transferController');


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