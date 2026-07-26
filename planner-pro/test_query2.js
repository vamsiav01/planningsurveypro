const https = require('https');
const query = `[out:json][timeout:25];(
  way["amenity"~"college|university|hospital|school|public_building"](23.21,77.40,23.22,77.41);
);out body geom;`;
https.get('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query), res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => console.log('STATUS:', res.statusCode, 'LENGTH:', data.length, 'START:', data.slice(0, 100)));
});
