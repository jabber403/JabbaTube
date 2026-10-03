const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure uploads folder exists so it doesn't crash on boot or after a wipe
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads', { recursive: true });
}

// Multer storage setup for video and thumbnail files
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync('uploads')) {
            fs.mkdirSync('uploads', { recursive: true });
        }
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// In-memory data stores
let users = []; 
let videos = []; 
let playlists = []; 

// --- AUTH ROUTES ---
app.post('/api/signup', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    const existing = users.find(u => u.username === username);
    if (existing) return res.status(400).json({ error: 'User already exists' });

    users.push({ username, password });
    res.json({ success: true, username });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });
    
    res.json({ success: true, username });
});

// --- VIDEO ROUTES ---
app.get('/api/videos', (req, res) => res.json(videos));

app.get('/api/videos/:id', (req, res) => {
    const video = videos.find(v => v.id == req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    res.json(video);
});

// Upload video with actual file attachments using Multer
app.post('/api/videos', upload.fields([{ name: 'videoFile', maxCount: 1 }, { name: 'thumbnailFile', maxCount: 1 }]), (req, res) => {
    try {
        const { title, uploader } = req.body;
        const videoFile = req.files && req.files['videoFile'] ? `/uploads/${req.files['videoFile'][0].filename}` : '';
        const thumbnailFile = req.files && req.files['thumbnailFile'] ? `/uploads/${req.files['thumbnailFile'][0].filename}` : '';

        const newVideo = {
            id: Date.now(),
            title,
            videoUrl: videoFile,
            thumbnailUrl: thumbnailFile,
            uploader: uploader || 'Guest',
            likes: 0,
            dislikes: 0,
            comments: []
        };

        videos.push(newVideo);
        res.json(newVideo);
    } catch (err) {
        console.error('Error handling upload:', err);
        res.status(500).json({ error: 'Internal server error during upload' });
    }
});

// --- INTERACTIONS (Likes, Comments) ---
app.post('/api/videos/:id/vote', (req, res) => {
    const { type } = req.body;
    const video = videos.find(v => v.id == req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });

    if (type === 'like') video.likes++;
    if (type === 'dislike') video.dislikes++;
    res.json({ likes: video.likes, dislikes: video.dislikes });
});

app.post('/api/videos/:id/comments', (req, res) => {
    const { text, username } = req.body;
    const video = videos.find(v => v.id == req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });

    video.comments.unshift({ username, text, date: new Date().toLocaleDateString() });
    res.json(video.comments);
});

// --- PLAYLIST ROUTES ---
app.get('/api/playlists', (req, res) => res.json(playlists));

app.post('/api/playlists', (req, res) => {
    const { name, username } = req.body;
    const newPlaylist = {
        id: Date.now(),
        name,
        creator: username,
        videoIds: []
    };
    playlists.push(newPlaylist);
    res.json(newPlaylist);
});

app.get('/api/playlists/:id', (req, res) => {
    const playlist = playlists.find(p => p.id == req.params.id);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    
    const resolvedVideos = playlist.videoIds.map(id => videos.find(v => v.id == id)).filter(Boolean);
    res.json({ ...playlist, videos: resolvedVideos });
});

app.post('/api/playlists/:id/add', (req, res) => {
    const { videoId } = req.body;
    const playlist = playlists.find(p => p.id == req.params.id);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    if (!playlist.videoIds.includes(videoId)) {
        playlist.videoIds.push(videoId);
    }
    res.json(playlist);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));