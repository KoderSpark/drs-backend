const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Verify configuration
const config = cloudinary.config();
cloudinary.__configured = !!(config.cloud_name && config.api_key && config.api_secret);

// Log configuration status (without sensitive details)
if (cloudinary.__configured) {
  console.log('Cloudinary configured successfully for cloud:', config.cloud_name);
} else {
  console.warn('Cloudinary configuration missing or incomplete. Check your .env file.');
  console.log('Expected environment variables:');
  console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Missing');
  console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? 'Set' : 'Missing');
  console.log('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Missing');
}

if (!cloudinary.__configured) {
  // make the error message actionable for developers
  // avoid logging secrets; give hints only
  console.warn('Cloudinary is not fully configured. Provide CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET in your environment. See Backend/.env.example for an example.');
}

module.exports = cloudinary;
