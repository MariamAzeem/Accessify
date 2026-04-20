console.log('Starting server...');
require('dotenv').config();
console.log('.env loaded');

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// ========================
// MIDDLEWARE 
// ========================
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Serve public FIRST (highest priority)
app.use('/public', express.static(path.join(__dirname, 'public')));

//  Serve frontend files (lower priority)
app.use(express.static(path.join(__dirname, '../frontend')));

console.log('Middleware loaded - /public served first!');

console.log('Connecting to Neon...');
console.log('DB_URL exists:', !!process.env.DB_CONNECTION_STRING);

const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
});

// ========================
// DATABASE + ROUTES (UNCHANGED - PERFECT)
// ========================
pool.on('connect', () => console.log('Neon CONNECTED!'));
pool.on('error', (err) => console.error('Neon ERROR:', err.message));

pool.query('SELECT NOW()')
  .then(() => console.log('Database query OK!'))
  .catch(err => console.error('Database query FAILED:', err.message));

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time');
    res.json({ status: 'OK', time: result.rows[0].time, neon: true });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', error: err.message });
  }
});

// Get all buildings
app.get('/api/buildings', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.name, p.category, p.lat, p.lng, p.last_verified,
             s.service_name, r.rating, ph.photo_url
      FROM places p
      LEFT JOIN services s ON p.id = s.place_id
      LEFT JOIN reviews r ON s.id = r.service_id
      LEFT JOIN photos ph ON p.id = ph.place_id
    `);

    const rows = result.rows;
    const buildingsMap = {};

    rows.forEach(row => {
      if (!buildingsMap[row.id]) {
        buildingsMap[row.id] = {
          id: row.id, name: row.name, category: row.category,
          lat: row.lat, lng: row.lng, lastVerified: row.last_verified,
          serviceScores: {}, photos: []
        };
      }

      if (row.service_name && row.rating) {
        if (!buildingsMap[row.id].serviceScores[row.service_name]) {
          buildingsMap[row.id].serviceScores[row.service_name] = [];
        }
        buildingsMap[row.id].serviceScores[row.service_name].push(row.rating);
      }

      if (row.photo_url && !buildingsMap[row.id].photos.includes(row.photo_url)) {
        buildingsMap[row.id].photos.push(row.photo_url);
      }
    });

    Object.values(buildingsMap).forEach(b => {
      for (let service in b.serviceScores) {
        const arr = b.serviceScores[service];
        b.serviceScores[service] = arr.length ? arr.reduce((a, c) => a + c, 0) / arr.length : 0;
      }
    });

    res.json(Object.values(buildingsMap));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Simple places
app.get('/api/places', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM places');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full places with photos
app.get('/api/places-full', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.name, p.category, p.lat, p.lng, p.last_verified,
             s.service_name, r.rating, ph.photo_url
      FROM places p
      LEFT JOIN services s ON p.id = s.place_id
      LEFT JOIN reviews r ON s.id = r.service_id
      LEFT JOIN photos ph ON p.id = ph.place_id
      ORDER BY p.id
    `);

    const buildingsMap = {};

    result.rows.forEach(row => {
      if (!buildingsMap[row.id]) {
        buildingsMap[row.id] = {
          id: row.id, name: row.name, category: row.category,
          lat: row.lat, lng: row.lng, lastVerified: row.last_verified,
          serviceScores: {}, photos: []
        };
      }

      if (row.service_name && row.rating) {
        if (!buildingsMap[row.id].serviceScores[row.service_name]) {
          buildingsMap[row.id].serviceScores[row.service_name] = [];
        }
        buildingsMap[row.id].serviceScores[row.service_name].push(row.rating);
      }

      if (row.photo_url && !buildingsMap[row.id].photos.includes(row.photo_url)) {
        buildingsMap[row.id].photos.push(row.photo_url);
      }
    });

    Object.values(buildingsMap).forEach(b => {
      for (let service in b.serviceScores) {
        const arr = b.serviceScores[service];
        b.serviceScores[service] = arr.length ? arr.reduce((a, c) => a + c, 0) / arr.length : 0;
      }
    });

    res.json(Object.values(buildingsMap));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
//  FIXED PHOTO UPLOAD - BETTER ERROR HANDLING
// ========================
app.post('/api/buildings/:id/review', async (req, res) => {
  const buildingId = parseInt(req.params.id);
  const { ratings, photos } = req.body;

  if (!buildingId || !ratings || Object.keys(ratings).length === 0) {
    return res.status(400).json({ error: 'Missing ratings' });
  }

  //  Ensure public folder exists
  const publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    console.log('Created public/ directory');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert reviews
    const serviceResult = await client.query(
      'SELECT id, service_name FROM services WHERE place_id = $1',
      [buildingId]
    );

    let reviewCount = 0;
    for (let service of serviceResult.rows) {
      const ratingValue = ratings[service.service_name];
      if (ratingValue != null && ratingValue > 0 && ratingValue <= 5) {
        await client.query(
          'INSERT INTO reviews(service_id, rating) VALUES($1, $2)',
          [service.id, ratingValue]
        );
        reviewCount++;
      }
    }

    //  Insert photos with better error handling
    let photoCount = 0;
    if (photos && photos.length > 0) {
      for (let i = 0; i < photos.length; i++) {
        try {
          const base64Data = photos[i].replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');

          const extMatch = photos[i].match(/^data:image\/(\w+);base64,/);
          const ext = extMatch ? extMatch[1] : 'png';

          const filename = `review_${buildingId}_${Date.now()}_${i}.${ext}`;
          const filepath = path.join(publicDir, filename);

          //  Ensure write permissions
          fs.writeFileSync(filepath, buffer);
          console.log(` Saved photo: /public/${filename}`);

          await client.query(
            'INSERT INTO photos(place_id, photo_url) VALUES($1, $2)',
            [buildingId, `/public/${filename}`] 
          );

          photoCount++;
        } catch (photoErr) {
          console.error(` Photo ${i} failed:`, photoErr.message);
        }
      }
    }

    await client.query('COMMIT');

    res.json({
      status: 'OK',
      message: 'Review saved!',
      saved: { reviews: reviewCount, photos: photoCount }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Review error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Images: http://localhost:${PORT}/public/`);
  console.log('Backend ready!');
});
