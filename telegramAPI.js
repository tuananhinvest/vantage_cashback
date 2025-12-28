// telegramAPI.js
const { getBot } = require('./telegramBotInstance');
const bot = getBot(); // mặc định polling: false

function sendMessage(chatId, message, options = {}) {
    return bot.sendMessage(chatId, message, options);
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
    return bot.sendDocument(chatId, filePath, {
        caption,
        ...options
    });
}


module.exports = {
    sendMessage,
    sendPhoto,
    sendVideo,
    deleteMessage,
    sendFile,
};
