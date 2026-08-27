const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const uploadDirectory = path.resolve(__dirname, '../../uploads/images');

fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, uploadDirectory),
  filename: (req, file, callback) => {
    callback(null, `${crypto.randomUUID()}.upload`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  }
});

async function detectImageType(filePath) {
  const fileHandle = await fsPromises.open(filePath, 'r');
  const bytes = Buffer.alloc(12);

  try {
    await fileHandle.read(bytes, 0, bytes.length, 0);
  } finally {
    await fileHandle.close();
  }

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) {
    return { mimeType: 'image/jpeg', extension: '.jpg' };
  }

  const isPng = bytes.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
  if (isPng) {
    return { mimeType: 'image/png', extension: '.png' };
  }

  const isWebp =
    bytes.subarray(0, 4).equals(Buffer.from('RIFF')) &&
    bytes.subarray(8, 12).equals(Buffer.from('WEBP'));
  if (isWebp) {
    return { mimeType: 'image/webp', extension: '.webp' };
  }

  return null;
}

module.exports = {
  upload,
  detectImageType
};
