const s=23.21,w=77.40,n=23.22,e=77.41;
const query = `[out:json][timeout:25];(way["building"](${s},${w},${n},${e});relation["building"](${s},${w},${n},${e});way["building:part"](${s},${w},${n},${e});relation["building:part"](${s},${w},${n},${e}););out body geom;`;
fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'data=' + encodeURIComponent(query)
}).then(r => r.json()).then(d => console.log("Elements found:", d.elements.length)).catch(console.error);
