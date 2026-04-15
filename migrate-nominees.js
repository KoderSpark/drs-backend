const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Doctor = require('./models/Doctor');

async function migrateNominees() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const doctors = await Doctor.find({});
    console.log(`Found ${doctors.length} doctors. Migrating...`);

    let migratedCount = 0;

    for (const doctor of doctors) {
      if (!doctor.nominees || doctor.nominees.length === 0) {
        if (doctor.nominee && Object.keys(doctor.nominee).length > 0 && doctor.nominee.name) {
          // Has legacy nominee, migrate it
          const legacyNominee = doctor.nominee;
          legacyNominee.percentage = 100;
          
          doctor.nominees = [legacyNominee];
          await doctor.save();
          migratedCount++;
        }
      }
    }

    console.log(`Migration complete. Migrated ${migratedCount} documents.`);
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrateNominees();
