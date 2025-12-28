// userAccess.js
const allowedUsers = {
    usernames: ['TuanAnhInvest', 'BiCanTho'],
    telegramIds: []
};

function isUserAllowed(msg) {
    const userId = msg.from.id;
    const username = msg.from.username;
    return (
        allowedUsers.telegramIds.includes(userId) ||
        (username && allowedUsers.usernames.includes(username))
    );
}

module.exports = { isUserAllowed };
