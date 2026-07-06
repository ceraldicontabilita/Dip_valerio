const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URL;
  const dbName = process.env.DB_NAME || 'ceraldi_presenze';
  if (!uri) {
    throw new Error('MONGO_URL non impostata — copia .env.example in .env e compilala');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName });
  console.log(`[DB] Connesso a MongoDB, database "${dbName}"`);
}

module.exports = { connectDB };
