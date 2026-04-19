console.log('🐛 Starting server...');
require('dotenv').config();
console.log('🐛 .env loaded');

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

console.log('🐛 Middleware loaded');

// ========================
// DATABASE CONNECTION
// ========================
console.log('🐛 Connecting to Neon...');
console.log('DB_URL exists:', !!process.env.DB_CONNECTION_STRING);

const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
});

pool.on('connect', () => console.log('✅ Neon CONNECTED!'));
pool.on('error', (err) => console.error('❌ Neon ERROR:', err.message));

pool.query('SELECT NOW()')
  .then(() => console.log('✅ Database query OK!'))
  .catch(err => console.error('❌ Database query FAILED:', err.message));

// ========================
// ROUTES
// ========================

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time');
    res.json({
      status: 'OK',
      time: result.rows[0].time,
      neon: true
    });
  } catch (err) {
    res.status(500).json({ status: 'ERROR', error: err.message });
  }
});

// Get all buildings with aggregated service scores and photos
// FIXED: Same logic as /api/places-full
app.get('/api/buildings', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id, p.name, p.category, p.lat, p.lng, p.last_verified,
        s.service_name, r.rating, ph.photo_url
      FROM places p
      LEFT JOIN services s ON p.id = s.place_id
      LEFT JOIN reviews r ON s.id = r.service_id
      LEFT JOIN photos ph ON p.id = ph.place_id
    `);

    const rows = result.rows;
    const buildingsMap = {};

    // EXACT SAME AGGREGATION LOGIC
    rows.forEach(row => {
      if (!buildingsMap[row.id]) {
        buildingsMap[row.id] = {
          id: row.id,
          name: row.name,
          category: row.category,
          lat: row.lat,
          lng: row.lng,
          lastVerified: row.last_verified,
          serviceScores: {},
          photos: []
        };
      }

      if (row.service_name) {
        if (!buildingsMap[row.id].serviceScores[row.service_name]) {
          buildingsMap[row.id].serviceScores[row.service_name] = [];
        }
        if (row.rating) {
          buildingsMap[row.id].serviceScores[row.service_name].push(row.rating);
        }
      }

      if (row.photo_url && !buildingsMap[row.id].photos.includes(row.photo_url)) {
        buildingsMap[row.id].photos.push(row.photo_url);
      }
    });

    // Calculate averages
    Object.values(buildingsMap).forEach(b => {
      for (let service in b.serviceScores) {
        const arr = b.serviceScores[service];
        b.serviceScores[service] = arr.length ? (arr.reduce((a, c) => a + c, 0) / arr.length) : 0;
      }
    });

    res.json(Object.values(buildingsMap));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get simple list of places
app.get('/api/places', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM places');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full joined data WITH PHOTOS (for frontend)
app.get('/api/places-full', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id, p.name, p.category, p.lat, p.lng, p.last_verified,
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
          id: row.id,
          name: row.name,
          category: row.category,
          lat: row.lat,
          lng: row.lng,
          lastVerified: row.last_verified,
          serviceScores: {},
          photos: []
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
        b.serviceScores[service] = arr.length ? (arr.reduce((a, c) => a + c, 0) / arr.length) : 0;
      }
    });

    res.json(Object.values(buildingsMap));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
// POST REVIEW - FIXED VERSION
// ========================
app.post('/api/buildings/:id/review', async (req, res) => {
  const buildingId = parseInt(req.params.id);
  const { ratings, photos } = req.body;

  console.log('🐛 NEW REVIEW FOR BUILDING', buildingId);
  console.log('📊 Ratings:', ratings);
  console.log('🖼️ Photos count:', photos?.length || 0);

  if (!buildingId || !ratings || Object.keys(ratings).length === 0) {
    console.log('❌ Missing ratings');
    return res.status(400).json({ error: 'Missing ratings' });
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // STEP 1: Get services for this building
    const serviceResult = await client.query(
      'SELECT id, service_name FROM services WHERE place_id = $1',
      [buildingId]
    );
    
    console.log('🔍 Services available:', serviceResult.rows.map(s => s.service_name));

    let reviewCount = 0;

    // STEP 2: Save ratings for matching services
    for (let service of serviceResult.rows) {
      const ratingValue = ratings[service.service_name];
      if (ratingValue != null && ratingValue > 0 && ratingValue <= 5) {
        await client.query(
          'INSERT INTO reviews(service_id, rating) VALUES($1, $2)',
          [service.id, ratingValue]
        );
        console.log(`✅ Review saved: ${service.service_name} = ${ratingValue}/5`);
        reviewCount++;
      } else {
        console.log(`⚠️ No rating for: ${service.service_name}`);
      }
    }

    // STEP 3: Save photos
    let photoCount = 0;
    if (photos && photos.length > 0) {
      for (let i = 0; i < photos.length; i++) {
        try {
          const base64Data = photos[i].replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          
          const extMatch = photos[i].match(/^data:image\/(\w+);base64,/);
          const ext = extMatch ? extMatch[1] : 'png';
          
          const filename = `review_${buildingId}_${Date.now()}_${i}.${ext}`;
          const filepath = path.join(__dirname, 'public', filename);

          fs.writeFileSync(filepath, buffer);
          console.log(`💾 File saved: ${filename}`);

          // Save to DB (created_at handles missing column)
          await client.query(
            'INSERT INTO photos(place_id, photo_url) VALUES($1, $2)',
            [buildingId, filename]
          );
          console.log(`✅ Photo DB saved: ${filename}`);
          photoCount++;
        } catch (photoErr) {
          console.error(`❌ Photo ${i} error:`, photoErr.message);
        }
      }
    }

    await client.query('COMMIT');
    
    console.log(`🎉 SUCCESS: ${reviewCount} reviews + ${photoCount} photos saved!`);
    
    res.json({ 
      status: 'OK', 
      message: 'Review saved successfully!',
      saved: { reviews: reviewCount, photos: photoCount }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('💥 DATABASE ERROR:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running: http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/api/health`);
  console.log(`🗺️  Buildings: http://localhost:${PORT}/api/places-full`);
});