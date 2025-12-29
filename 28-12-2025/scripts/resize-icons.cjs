const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourceIcon = path.join(__dirname, '../src-tauri/icons/icon.png');
const publicDir = path.join(__dirname, '../public');

// Ensure public directory exists
if (!fs.existsSync(publicDir)){
    fs.mkdirSync(publicDir);
}

const resizeIcon = async (size) => {
  const outputPath = path.join(publicDir, `pwa-${size}x${size}.png`);
  try {
    await sharp(sourceIcon)
      .resize(size, size)
      .toFile(outputPath);
    console.log(`Successfully created ${outputPath}`);
  } catch (err) {
    console.error(`Error creating ${size}x${size} icon:`, err);
  }
};

const main = async () => {
  console.log('Starting icon resizing...');
  await resizeIcon(192);
  await resizeIcon(512);
  console.log('Icon resizing complete.');
};

main();
