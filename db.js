// db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

/* ================= POOL ================= */

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

/* ================= INIT TABLES ================= */

async function initTables() {
    const conn = await pool.getConnection();
    try {
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS vantage_cent (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                UID VARCHAR(50) UNIQUE,
                total_commission DECIMAL(15,2) DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await conn.execute(`
            CREATE TABLE IF NOT EXISTS vantage (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                UID VARCHAR(50),
                commission DECIMAL(15,2),
                volume DECIMAL(15,2),
                time DATETIME NOT NULL,
                created_at DATE,
                UNIQUE KEY uniq_uid_time (UID, time),
                KEY idx_uid_time (UID, time)
            )
        `);
    } finally {
        conn.release();
    }
}


/* ================= CENT ACCOUNT ================= */

async function upsertCentAccount(account, commission) {
    const conn = await pool.getConnection();
    try {
        await conn.execute(
            `
            INSERT INTO vantage_cent (UID, total_commission)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE
                total_commission = total_commission + VALUES(total_commission)
            `,
            [account, commission]
        );
    } finally {
        conn.release();
    }
}

/* ================= VANTAGE DATA ================= */

async function upsertVantageData(account, commission, volume, date) {
    const conn = await pool.getConnection();

    const time = `${date} 00:00:00`;

    try {
        await conn.execute(
            `
            INSERT INTO vantage (UID, commission, volume, time, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                commission = VALUES(commission),
                volume = VALUES(volume)
            `,
            [account, commission, volume, time, date]
        );
    } finally {
        conn.release();
    }
}



/* ================= CENT HELPERS ================= */

// lấy tổng commission cent đã tích lũy
async function getCentTotal(account) {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.execute(
            'SELECT total_commission FROM vantage_cent WHERE UID = ?',
            [account]
        );
        return rows.length ? Number(rows[0].total_commission) : 0;
    } finally {
        conn.release();
    }
}

// xóa cent account sau khi đã xử lý
async function deleteCentAccount(account) {
    const conn = await pool.getConnection();
    try {
        await conn.execute(
            'DELETE FROM vantage_cent WHERE UID = ?',
            [account]
        );
    } finally {
        conn.release();
    }
}


module.exports = {
    initTables,
    upsertCentAccount,
    upsertVantageData,
    getCentTotal,
    deleteCentAccount
};
