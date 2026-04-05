// Simple script to test email sending (doctor + nominee + family contacts)
// Usage: set TEST_DOCTOR_EMAIL, TEST_NOMINEE_EMAIL, TEST_FAMILY1_EMAIL, TEST_FAMILY2_EMAIL env vars if you want

const { sendWelcomeEmail } = require('../utils/emailService');

async function run() {
  const doctorEmail = process.env.TEST_DOCTOR_EMAIL || 'doctor-test@example.com';
  const nomineeEmail = process.env.TEST_NOMINEE_EMAIL || 'nominee-test@example.com';
  const family1Email = process.env.TEST_FAMILY1_EMAIL || 'family1-test@example.com';
  const family2Email = process.env.TEST_FAMILY2_EMAIL || 'family2-test@example.com';

  const doctorData = {
    name: 'Test Doctor',
    email: doctorEmail,
    nominee: { name: 'Nominee Test', email: nomineeEmail },
    familyMember1: { name: 'Family One', email: family1Email },
    familyMember2: { name: 'Family Two', email: family2Email }
  };

  console.log('Calling sendWelcomeEmail with payload:', JSON.stringify(doctorData, null, 2));
  try {
    const res = await sendWelcomeEmail(doctorData);
    console.log('sendWelcomeEmail result:', res);
  } catch (err) {
    console.error('sendWelcomeEmail threw error:', err && err.stack ? err.stack : err);
  }
}

run().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});