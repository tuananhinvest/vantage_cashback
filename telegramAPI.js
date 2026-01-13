// telegramAPI.js
const { getBot } = require('./telegramBotInstance');
const bot = getBot(); // mặc định polling: false

async function safeTelegram(fn, retry = 3, delay = 2000) {
    try {
        return await fn();
    } catch (err) {
        if (
            retry > 0 &&
            (err.code === 'ECONNRESET' ||
             err.code === 'ETIMEDOUT' ||
             err.code === 'EAI_AGAIN')
        ) {
            console.warn(`⚠️ Telegram error ${err.code}, retry...`);
            await new Promise(r => setTimeout(r, delay));
            return safeTelegram(fn, retry - 1, delay * 1.5);
        }

        console.error('❌ Telegram error:', err.message);
        return null; // QUAN TRỌNG: không throw
    }
}

function sendMessage(chatId, message, options = {}) {
    return safeTelegram(() =>
        bot.sendMessage(chatId, message, options)
    );
}


function sendPhoto(chatId, photoUrl, caption = '', options = {}) {
    return bot.sendPhoto(chatId, photoUrl, { caption, ...options });
}

function sendVideo(chatId, videoStream, caption = '', options = {}) {
    return bot.sendVideo(chatId, videoStream, { caption, ...options });
}

function deleteMessage(chatId, messageId) {
    return bot.deleteMessage(chatId, messageId);
}

function sendFile(chatId, filePath, caption = '', options = {}) {
    return safeTelegram(() =>
        bot.sendDocument(chatId, filePath, { caption, ...options })
    );
}



module.exports = {
    sendMessage,
    sendPhoto,
    sendVideo,
    deleteMessage,
    sendFile,
};
