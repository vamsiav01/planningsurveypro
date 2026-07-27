const fs = require('fs');
const RBush = require('rbush');
const turfBbox = require('@turf/bbox').default;

const data = JSON.parse(fs.readFileSync('../public/bhopal_buildings.json', 'utf-8'));
console.log(`Loaded ${data.length} buildings.`);

// Verify first item
const first = data[0];
const geom = JSON.parse(first.geom);
console.log("First geom type:", geom.type);
console.log("First geom coords:", geom.coordinates[0].slice(0,2));
