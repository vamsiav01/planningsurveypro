const https = require('https');
const query = `[out:json][timeout:25];
(
  way(23.214,77.400,23.218,77.408);
);
out body geom;`;
https.get('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query), res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const elements = JSON.parse(data).elements;
      const ways = elements.filter(e => e.type === 'way');
      console.log('Total ways:', ways.length);
      ways.forEach(w => {
        if (w.tags) {
          console.log(w.tags);
        }
      });
    } catch (e) { console.error('Error parsing JSON'); }
  });
});
