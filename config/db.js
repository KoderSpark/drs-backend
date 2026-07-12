const mongoose = require('mongoose');
const dns = require('dns');

// Resolve mongodb+srv:// using Google DNS (8.8.8.8) to bypass ISP SRV blocks
const resolveSrvUri = (srvUri) => {
  return new Promise((resolve, reject) => {
    const url = new URL(srvUri);
    const hostname = url.hostname;

    const resolver = new dns.Resolver();
    resolver.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

    resolver.resolveSrv(`_mongodb._tcp.${hostname}`, (err, addresses) => {
      if (err) return reject(err);

      const hosts = addresses.map((a) => `${a.name}:${a.port}`).join(',');
      const user = encodeURIComponent(decodeURIComponent(url.username));
      const pass = encodeURIComponent(decodeURIComponent(url.password));
      const db   = url.pathname || '/';

      const standardUri =
        `mongodb://${user}:${pass}@${hosts}${db}` +
        `?ssl=true&authSource=admin&retryWrites=true&w=majority`;

      resolve(standardUri);
    });
  });
};

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  try {
    const MONGO_URI =
      process.env.MONGODB_URI ||
      process.env.MONGO_URI ||
      process.env.DATABASE_URL ||
      process.env.DB_URL ||
      process.env.MONGO_URL;

    if (!MONGO_URI) {
      console.error('Missing MongoDB connection string. Set MONGODB_URI in your .env file.');
      return; 
    }

    let connectionUri = MONGO_URI;

    // Skip this on Vercel because Vercel blocks custom DNS resolvers on port 53
    if (MONGO_URI.startsWith('mongodb+srv://') && !process.env.VERCEL) {
      try {
        console.log('Resolving MongoDB SRV record via Google DNS...');
        connectionUri = await resolveSrvUri(MONGO_URI);
        console.log('SRV resolved successfully.');
      } catch (srvErr) {
        console.warn('SRV resolution failed:', srvErr.message);
        console.warn('Falling back to original URI...');
      }
    }

    if (!cached.promise) {
      console.log('Establishing new MongoDB connection...');
      cached.promise = mongoose.connect(connectionUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 10000,
        family: 4,
      }).then((mongoose) => {
        return mongoose;
      });
    }

    cached.conn = await cached.promise;
    console.log('MongoDB connected');
    return cached.conn;
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    cached.promise = null; // Reset promise on error so it can retry
    throw err;
  }
};

module.exports = connectDB;

