const lat = 23.2;
const lng = 77.4;
const overpassQuery = `[out:json];(way[building](around:20, ${lat}, ${lng});relation[building](around:20, ${lat}, ${lng}););out body geom;`;
fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { 
    "Accept": "application/json",
    "Content-Type": "application/x-www-form-urlencoded" 
  },
  body: `data=${encodeURIComponent(overpassQuery)}`
})
  .then(res => res.text())
  .then(data => console.log(data.substring(0, 500)))
  .catch(err => console.error(err));
