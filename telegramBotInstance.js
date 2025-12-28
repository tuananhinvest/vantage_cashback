// telegramBotInstance.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

let botInstance = null;

function getBot(polling = false) {
    if (!botInstance) {
        botInstance = new TelegramBot(
            '8276904412:AAERtp-1QsnvliBtLPthBpwbeGsZgt2LDX4',
            { polling }
        );
    }
    return botInstance;
}

// 👇 EXPORT THÊM
function getBotInstance() {
    if (!botInstance) {
        throw new Error('Bot chưa được khởi tạo');
    }
    return botInstance;
}

module.exports = {
    getBot,
    getBotInstance
};
