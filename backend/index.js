const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// Serve static assets if placed in backend/public (e.g., audio, covers)
app.use('/static', express.static(path.join(__dirname, 'public')));

const DATA_FILE_PATH = path.join(__dirname, 'data.json');

function loadSongsData() {
  try {
    if (!fs.existsSync(DATA_FILE_PATH)) {
      console.warn(`[WARN] data.json not found at ${DATA_FILE_PATH}`);
      return [];
    }
    const raw = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[ERROR] Failed to load or parse data.json:', err.message);
    return [];
  }
}

function saveSongsData(songs) {
  try {
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(songs, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[ERROR] Failed to save data.json:', err.message);
    return false;
  }
}

app.get('/', (req, res) => {
  res.json({
    status: 'Healthy',
    service: 'Project:KANADE API'
  });
});

// READ: Get all songs
app.get('/songs', (req, res) => {
  try {
    const songs = loadSongsData();
    res.json(songs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve songs data' });
  }
});

// CREATE: Add a new song
app.post('/songs', (req, res) => {
  try {
    const { filename, title, artists, composers, year } = req.body;

    if (!filename || !filename.trim()) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    const songs = loadSongsData();
    const cleanFilename = filename.trim();

    // Check duplicate filename
    const exists = songs.some(
      (s) => s.filename.toLowerCase() === cleanFilename.toLowerCase()
    );
    if (exists) {
      return res.status(409).json({ error: `Song with filename "${cleanFilename}" already exists` });
    }

    const newSong = {
      filename: cleanFilename,
      title: title && title.trim() ? title.trim() : path.parse(cleanFilename).name,
      artists: Array.isArray(artists)
        ? artists.map((a) => String(a).trim()).filter(Boolean)
        : [],
      composers: Array.isArray(composers)
        ? composers.map((c) => String(c).trim()).filter(Boolean)
        : [],
      year: year != null && !isNaN(parseInt(year, 10)) ? parseInt(year, 10) : null
    };

    songs.push(newSong);

    if (!saveSongsData(songs)) {
      return res.status(500).json({ error: 'Failed to write song data to file' });
    }

    res.status(201).json(newSong);
  } catch (error) {
    console.error('[ERROR] Failed to create song:', error);
    res.status(500).json({ error: 'Failed to create song' });
  }
});

// UPDATE: Update a song by filename
app.put('/songs/:filename', (req, res) => {
  try {
    const targetFilename = decodeURIComponent(req.params.filename);
    const { title, artists, composers, year } = req.body;

    const songs = loadSongsData();
    const songIndex = songs.findIndex(
      (s) => s.filename.toLowerCase() === targetFilename.toLowerCase()
    );

    if (songIndex === -1) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const existing = songs[songIndex];
    const updated = {
      ...existing,
      ...(title !== undefined && { title: String(title).trim() }),
      ...(artists !== undefined && {
        artists: Array.isArray(artists)
          ? artists.map((a) => String(a).trim()).filter(Boolean)
          : []
      }),
      ...(composers !== undefined && {
        composers: Array.isArray(composers)
          ? composers.map((c) => String(c).trim()).filter(Boolean)
          : []
      }),
      ...(year !== undefined && {
        year: year != null && !isNaN(parseInt(year, 10)) ? parseInt(year, 10) : null
      })
    };

    songs[songIndex] = updated;

    if (!saveSongsData(songs)) {
      return res.status(500).json({ error: 'Failed to write updated song data' });
    }

    res.json(updated);
  } catch (error) {
    console.error('[ERROR] Failed to update song:', error);
    res.status(500).json({ error: 'Failed to update song' });
  }
});

// DELETE: Batch delete songs or single song
app.delete('/songs', (req, res) => {
  try {
    const { filenames } = req.body;
    if (!Array.isArray(filenames) || filenames.length === 0) {
      return res.status(400).json({ error: 'filenames array is required' });
    }

    const targetSet = new Set(filenames.map((f) => String(f).toLowerCase()));
    const songs = loadSongsData();
    const filtered = songs.filter(
      (s) => !targetSet.has(s.filename.toLowerCase())
    );

    const deletedCount = songs.length - filtered.length;

    if (!saveSongsData(filtered)) {
      return res.status(500).json({ error: 'Failed to persist deletion' });
    }

    res.json({ success: true, deletedCount });
  } catch (error) {
    console.error('[ERROR] Failed to delete songs:', error);
    res.status(500).json({ error: 'Failed to delete songs' });
  }
});

// DELETE: Delete single song by filename
app.delete('/songs/:filename', (req, res) => {
  try {
    const targetFilename = decodeURIComponent(req.params.filename);
    const songs = loadSongsData();
    const filtered = songs.filter(
      (s) => s.filename.toLowerCase() !== targetFilename.toLowerCase()
    );

    if (filtered.length === songs.length) {
      return res.status(404).json({ error: 'Song not found' });
    }

    if (!saveSongsData(filtered)) {
      return res.status(500).json({ error: 'Failed to persist deletion' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[ERROR] Failed to delete song:', error);
    res.status(500).json({ error: 'Failed to delete song' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
