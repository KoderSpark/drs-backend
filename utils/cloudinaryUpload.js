const cloudinary = require('../config/cloudinary');

function uploadBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    if (!cloudinary || !cloudinary.__configured) {
      return reject(new Error('Cloudinary configuration is missing. Please check your .env file and ensure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set correctly.'));
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        ...options
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return reject(new Error(`Failed to upload to Cloudinary: ${error.message}`));
        }
        resolve(result);
      }
    );

    uploadStream.end(buffer);
  });
}

module.exports = { uploadBuffer };
