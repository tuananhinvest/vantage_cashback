// processRebate.js
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
require('dotenv').config();
const { sendMessage, sendFile } = require('./telegramAPI');
const USER_ID = process.env.TELEGRAM_ID;

const {
    initTables,
    upsertCentAccount,
    upsertVantageData,
    getCentTotal,
    deleteCentAccount
} = require('./db');

/* ================= CONFIG ================= */

const DATA_DIR = path.join(__dirname, 'vantage_data');
const MICRO_MAP_FILE = path.join(__dirname, 'vantage_micro.xlsx');

/* ================= HELPERS ================= */

function getYesterdayString() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getTodayString() {
    const d = new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function findRebateFileByDate(dateStr) {
    const files = fs.readdirSync(DATA_DIR);

    return files.find(file => {
        if (!file.endsWith('.xlsx')) return false;

        const matches = file.match(new RegExp(dateStr, 'g'));
        return matches && matches.length >= 2;
    });
}

function loadMicroAccountMap() {
    if (!fs.existsSync(MICRO_MAP_FILE)) {
        throw new Error('❌ Không tìm thấy file vantage_micro.xlsx');
    }

    const wb = XLSX.readFile(MICRO_MAP_FILE);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const map = new Map();
    for (let i = 1; i < rows.length; i++) {
        const [fromAcc, toAcc] = rows[i];
        if (fromAcc && toAcc) {
            map.set(String(fromAcc).trim(), String(toAcc).trim());
        }
    }
    return map;
}

/* ================= MAIN ================= */

async function processRebate() {
    console.log('📂 Bắt đầu xử lý file rebate');
    await initTables();

    const yesterday = getYesterdayString();
    const today = getTodayString();

    console.log('📅 Ngày kiểm tra file:', yesterday);
    console.log('📅 Ngày xuất CSV:', today);

    const rebateFileName = findRebateFileByDate(yesterday);

    if (!rebateFileName) {
        console.log(`⚠️ Chưa tồn tại file rebate cho ngày ${yesterday}`);
        return {
            success: false,
            message: 'Rebate file not found',
            totalUSD: 0
        };
    }

    const rebateFilePath = path.join(DATA_DIR, rebateFileName);
    console.log('✅ Tìm thấy file:', rebateFileName);

    const microMap = loadMicroAccountMap();
    console.log('📘 Đã load mapping Micro account');

    const wb = XLSX.readFile(rebateFilePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const accountTotalMap = new Map();
    let totalUSD = 0;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];

        const account = String(row[2] || '').trim();   // C
        const volume = Number(row[4] || 0);            // E
        const lotType = String(row[5] || '').trim();   // F
        const commission = Number(row[8] || 0);        // I

        if (!account || commission === 0) continue;

        /* ================= MICRO (CENT) ================= */

        if (lotType === 'Micro') {

            // ❌ CHƯA MAP → LƯU DB CENT
            if (!microMap.has(account)) {
                console.log(`⚠️ Cent chưa map: ${account}`);

                await upsertCentAccount(account, commission);

                await sendMessage(
                    USER_ID,
                    `⚠️ Cent chưa map: ${account}\nHoa hồng hôm nay: ${commission.toFixed(2)}$`,
                    { parse_mode: 'Markdown' }
                );

                continue;
            }

            // ✅ ĐÃ MAP → GỘP CENT CŨ + HÔM NAY
            const mappedAccount = microMap.get(account);

            const centAccumulated = await getCentTotal(account);
            const finalCommission = centAccumulated + commission;

            console.log(
                `✅ Cent đã map: ${account} → ${mappedAccount} | Tổng: ${finalCommission.toFixed(2)}`
            );

            const current = accountTotalMap.get(mappedAccount) || 0;
            accountTotalMap.set(mappedAccount, current + finalCommission);

            totalUSD += finalCommission;

            // lưu DB vantage
            await upsertVantageData(
                mappedAccount,
                finalCommission,
                volume,
                today
            );

            // ❗ xóa cent khỏi DB
            await deleteCentAccount(account);

            continue;
        }

        /* ================= ACCOUNT THƯỜNG ================= */

        const current = accountTotalMap.get(account) || 0;
        accountTotalMap.set(account, current + commission);

        totalUSD += commission;

        // lưu DB vantage
        await upsertVantageData(
            account,
            commission,
            volume,
            today
        );
    }

    if (accountTotalMap.size === 0) {
        console.log('⚠️ Không có dữ liệu hợp lệ để xuất file');
        return {
            success: false,
            message: 'No valid rebate data',
            totalUSD: 0
        };
    }

    /* ================= EXPORT CSV ================= */

    const OUTPUT_CSV = path.join(__dirname, `${today}.csv`);

    const lines = Array.from(accountTotalMap.entries())
        .map(([account, amount]) => `${account},${amount.toFixed(2)}`)
        .join('\n');

    fs.writeFileSync(OUTPUT_CSV, lines, 'utf8');

    console.log('✅ Đã xuất file CSV:', OUTPUT_CSV);
    console.log(`📊 Tổng số tài khoản: ${accountTotalMap.size}`);
    console.log(`💰 Tổng hoa hồng USD: ${totalUSD.toFixed(2)}`);

    await sendFile(
        USER_ID,
        OUTPUT_CSV,
        `Tổng thưởng hôm nay: ${totalUSD.toFixed(2)}$`
    );

    await sendMessage(
        USER_ID,
        'Click /thuong để thực hiện thưởng',
        { parse_mode: 'Markdown' }
    );

    return {
        success: true,
        csvFile: OUTPUT_CSV,
        totalAccounts: accountTotalMap.size,
        totalUSD: Number(totalUSD.toFixed(2))
    };
}

/* ================= EXPORT ================= */

module.exports = {
    processRebate
};
