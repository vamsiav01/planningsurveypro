const fs = require('fs');
const text = fs.readFileSync('C:/Users/asus/.gemini/antigravity-ide/brain/d4142263-ba88-4aef-af1c-f0ba3a9f7606/.system_generated/logs/transcript.jsonl', 'utf-8');
const urls = new Set(text.match(/https?:\/\/[^\s"'\\}]+/g) || []);
for (const u of urls) {
  if (!u.includes('react-leaflet') && !u.includes('localhost') && !u.includes('w3.org') && !u.includes('schema.org')) {
    console.log(u);
  }
}
