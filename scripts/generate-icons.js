const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function createIcon(size) {
  // Create a brutalist-style icon: dark concrete gray with nested squares
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="#1a1a1a"/>
      <rect x="${size*0.15}" y="${size*0.15}" width="${size*0.7}" height="${size*0.7}" fill="#333333"/>
      <rect x="${size*0.25}" y="${size*0.25}" width="${size*0.5}" height="${size*0.5}" fill="#4a4a4a"/>
      <rect x="${size*0.35}" y="${size*0.35}" width="${size*0.3}" height="${size*0.3}" fill="#1a1a1a"/>
    </svg>
  `;

  const outPath = path.join(__dirname, '..', 'public', 'icons', `icon-${size}.png`);

  await sharp(Buffer.from(svg))
    .png()
    .toFile(outPath);

  console.log(`Created icon-${size}.png`);
}

// Ensure directory exists
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

Promise.all([createIcon(192), createIcon(512)])
  .then(() => console.log('Icons created!'))
  .catch(console.error);
