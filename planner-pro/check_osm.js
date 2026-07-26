const https = require('https'); 
const query = '[out:json][timeout:25];(way["building"](23.210,77.400,23.220,77.415);relation["building"](23.210,77.400,23.220,77.415);way["amenity"](23.210,77.400,23.220,77.415);way["historic"](23.210,77.400,23.220,77.415););out body geom;';
https.get('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query), res => { 
  let data = ''; 
  res.on('data', c => data += c); 
  res.on('end', () => console.log('Found elements:', JSON.parse(data).elements.length)); 
});
