const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text());
  });
  page.on('pageerror', error => errors.push('PAGEERROR: ' + error.message + '\nSTACK: ' + (error.stack || '').slice(0, 1000)));

  try {
    await page.goto('https://planningsurveyypro.netlify.app/dashboard?id=zogvkZYGWaJb3olxhByi', { waitUntil: 'networkidle2', timeout: 60000 });
  } catch(e) {
    console.log('GOTO ERR:', e.message);
  }
  
  await new Promise(r => setTimeout(r, 8000));
  
  if (errors.length === 0) {
    console.log('=== NO JS ERRORS DETECTED ===');
  } else {
    console.log('=== ERRORS FOUND ===');
    errors.forEach(e => console.log(e));
  }
  
  // Also check if the error div is in the DOM
  const errorDiv = await page.$eval('body', el => el.innerText).catch(() => '');
  if (errorDiv.includes('client-side exception')) {
    console.log('ERROR DIV PRESENT IN DOM');
  } else {
    console.log('ERROR DIV NOT PRESENT - page may have loaded ok');
  }
  
  await browser.close();
})();
