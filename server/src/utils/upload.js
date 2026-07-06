const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

function ensureDir(sub) {
  const dir = path.join(UPLOAD_ROOT, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Storage su disco locale, sotto server/uploads/<sottocartella>/ — sostituisce
// il bucket Supabase Storage "presenze-allegati". Nome file randomizzato per
// evitare collisioni e per non esporre il nome originale nell'URL.
function storageFor(sottocartella) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, ensureDir(sottocartella)),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10);
      cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  });
}

const MAX_SIZE = 10 * 1024 * 1024; // 10MB, come nell'app originale

function uploaderFor(sottocartella) {
  return multer({ storage: storageFor(sottocartella), limits: { fileSize: MAX_SIZE } });
}

module.exports = { uploaderFor, UPLOAD_ROOT };
