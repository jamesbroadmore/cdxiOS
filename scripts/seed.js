const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'cdxi_os';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@cdxi.io';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'demo123456';

const userSchema = new mongoose.Schema({
  id: { type: String, unique: true, default: () => require('crypto').randomUUID() },
  email: { type: String, unique: true, lowercase: true },
  password_hash: String,
  full_name: String,
  role: { type: String, enum: ['admin', 'user', 'agency_owner'], default: 'user' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

async function seed() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });

    const User = mongoose.model('User', userSchema);

    // Check if admin exists
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      console.log(`✓ Admin user already exists (${ADMIN_EMAIL})`);
      await mongoose.connection.close();
      process.exit(0);
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(ADMIN_PASSWORD, salt);

    // Create admin user
    const admin = new User({
      email: ADMIN_EMAIL,
      password_hash,
      full_name: 'Administrator',
      role: 'admin',
    });

    await admin.save();
    console.log(`✓ Admin user created: ${ADMIN_EMAIL}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
    console.log('');
    console.log('✓ Database seeded successfully!');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('✗ Seed failed:', error.message);
    process.exit(1);
  }
}

seed();
