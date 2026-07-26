const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR (pageerror):', error.message));
  page.on('error', error => console.log('BROWSER ERROR (error):', error.message));

  console.log("Navigating to dashboard...");
  // Use a real project ID from Firebase
  await page.goto('http://localhost:3000/dashboard/d7nRddQ6H5cbVr8JtqhQ', { waitUntil: 'domcontentloaded' });

  console.log("Waiting for button to appear...");
  try {
    // Wait for the Settings2 icon or Form Builder text
    await page.waitForFunction(() => {
      return Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('Form Builder'));
    }, { timeout: 15000 });
    
    console.log("Evaluating click...");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent && b.textContent.includes('Form Builder'));
      if (btn) btn.click();
    });

    console.log("Waiting 3 seconds to see if it crashes...");
    await new Promise(r => setTimeout(r, 3000));
    
    const html = await page.content();
    if (html.includes("This page couldn't load")) {
      console.log("CRASH DETECTED: Found Error Boundary in HTML!");
    } else {
      console.log("No crash detected.");
    }
  } catch (err) {
    console.log("Puppeteer Error:", err.message);
  }

  console.log("Done.");
  await browser.close();
})();
