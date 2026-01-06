const puppeteer = require('puppeteer');
const cron = require('node-cron');
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

cron.schedule('12 23 * * *', async () => {
  console.log('⏰ Bắt đầu chạy lúc 9h40');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox']
  });

  const page = await browser.newPage();

  await sendMessage(USER_ID, '🔫 Bắt đầu lấy dữ liệu thưởng sàn Vantage');
  await loginVantage(page);
  await sleep(3000);
  await getRebateReport(page);
  await processRebate();
  await sleep(7000);
  await browser.close();
});