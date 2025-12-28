const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { loginVantage } = require('./loginVantage');
const { getRebateReport } = require('./getDataVantage');
const { processRebate} = require('./processRebate');
const { sendMessage } = require('./telegramAPI');
const USER_ID = process.env.TELEGRAM_ID;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
    const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,          // QUAN TRỌNG
    args: [
      '--start-maximized',           // mở full màn hình
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  const page = await browser.newPage();

  await sendMessage(USER_ID, '🔫 Bắt đầu lấy dữ liệu thưởng sàn Vantage', {
        parse_mode: 'Markdown',
      });

  //await loginVantage(page);
  //await sleep(3*1000);
  //await getRebateReport(page);
  await processRebate();

  // browser.close();
})();
