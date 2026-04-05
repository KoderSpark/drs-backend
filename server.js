const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // Fix: querySrv ECONNREFUSED on Windows

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config();

const connectDB = require('./config/db');

connectDB();

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve local uploads directory so fallback file uploads are reachable at /uploads/<filename>
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Images are stored in Cloudinary when configured; local /uploads is a fallback when Cloudinary isn't configured

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/doctors', require('./routes/doctorRoutes'));
app.use('/api/contacts', require('./routes/contactRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/debug', require('./routes/debugRoutes'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
