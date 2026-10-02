const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- PERSISTENT DATABASE SETUP ---
const DB_FILE = path.join(__dirname, 'db.json');

function loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            console.error('Error reading db.json, initializing defaults:', e);
        }
    }
    // Default initial database structure
    return {
        users: [],         // { username, password }
        videos: [],        // { id, title, videoUrl, thumbnailUrl, uploader, votes: {}, comments: [] }
        subscriptions: {}, // { username: [list of subscribed channels] }
        playlists: []      // { id, name, creator, videoIds: [] }
    };
}

function saveDatabase(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- AUTH API ---
app.post('/api/signup', (req, res) => {
    const db = loadDatabase();
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'All fields required' });
    
    if (db.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already taken' });
    }

    db.users.push({ username, password });
    saveDatabase(db);
    res.json({ success: true, username });
});

app.post('/api/login', (req, res) => {
    const db = loadDatabase();
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });
    
    res.json({ success: true, username });
});

// --- VIDEO API ---
app.get('/api/videos', (req, res) => {
    const db = loadDatabase();
    const formatted = db.videos.map(v => ({
        ...v,
        likes: Object.values(v.votes).filter(val => val === 'like').length,
        dislikes: Object.values(v.votes).filter(val => val === 'dislike').length
    }));
    res.json(formatted);
});

app.get('/api/videos/:id', (req, res) => {
    const db = loadDatabase();
    const video = db.videos.find(v => v.id == req.params.id);
    if (!video) return res.status(404).send('Video not found');

    res.json({
        ...video,
        likes: Object.values(video.votes).filter(val => val === 'like').length,
        dislikes: Object.values(video.votes).filter(val => val === 'dislike').length
    });
});

// Toggle Like / Dislike
app.post('/api/videos/:id/vote', (req, res) => {
    const db = loadDatabase();
    const { username, type } = req.body; 
    const video = db.videos.find(v => v.id == req.params.id);

    if (!video || !username) return res.status(400).send('Invalid request');

    if (video.votes[username] === type) {
        delete video.votes[username];
    } else {
        video.votes[username] = type;
    }

    saveDatabase(db);

    const likes = Object.values(video.votes).filter(val => val === 'like').length;
    const dislikes = Object.values(video.votes).filter(val => val === 'dislike').length;

    res.json({ likes, dislikes, userVote: video.votes[username] || null });
});

// Add Comment
app.post('/api/videos/:id/comments', (req, res) => {
    const db = loadDatabase();
    const video = db.videos.find(v => v.id == req.params.id);
    const { text, username } = req.body;
    if (video && text) {
        video.comments.push({ username: username || 'Anonymous', text, date: new Date().toLocaleDateString() });
        saveDatabase(db);
        res.json(video.comments);
    } else {
        res.status(400).send('Invalid request');
    }
});

// Upload Video
app.post('/api/upload', upload.fields([
    { name: 'videoFile', maxCount: 1 },
    { name: 'thumbnailFile', maxCount: 1 }
]), (req, res) => {
    const db = loadDatabase();
    const { title, username } = req.body;
    const videoFile = req.files['videoFile'] ? req.files['videoFile'][0].filename : null;
    const thumbnailFile = req.files['thumbnailFile'] ? req.files['thumbnailFile'][0].filename : null;

    if (!videoFile) return res.status(400).send('Video file is required.');

    const newVideo = {
        id: db.videos.length + 1,
        title: title || 'Untitled Video',
        uploader: username || 'Guest',
        videoUrl: `/uploads/${videoFile}`,
        thumbnailUrl: thumbnailFile ? `/uploads/${thumbnailFile}` : '/yt.png',
        votes: {}, 
        comments: []
    };

    db.videos.push(newVideo);
    saveDatabase(db);
    res.redirect('/');
});

// --- CHANNEL & SUBSCRIPTION API ---
app.get('/api/channels/:name', (req, res) => {
    const db = loadDatabase();
    const channelName = req.params.name;
    const channelVideos = db.videos.filter(v => v.uploader === channelName);
    
    let subCount = 0;
    Object.values(db.subscriptions).forEach(subs => {
        if (subs.includes(channelName)) subCount++;
    });

    res.json({
        username: channelName,
        videos: channelVideos,
        subscriberCount: subCount
    });
});

app.post('/api/subscribe', (req, res) => {
    const db = loadDatabase();
    const { subscriber, channelToSubscribe } = req.body;
    if (!subscriber || !channelToSubscribe || subscriber === channelToSubscribe) {
        return res.status(400).send('Invalid request');
    }

    if (!db.subscriptions[subscriber]) {
        db.subscriptions[subscriber] = [];
    }

    const index = db.subscriptions[subscriber].indexOf(channelToSubscribe);
    let isSubscribed = false;

    if (index > -1) {
        db.subscriptions[subscriber].splice(index, 1);
    } else {
        db.subscriptions[subscriber].push(channelToSubscribe);
        isSubscribed = true;
    }

    saveDatabase(db);

    let subCount = 0;
    Object.values(db.subscriptions).forEach(subs => {
        if (subs.includes(channelToSubscribe)) subCount++;
    });

    res.json({ isSubscribed, subscriberCount: subCount });
});

app.get('/api/is-subscribed', (req, res) => {
    const db = loadDatabase();
    const { subscriber, channel } = req.query;
    const isSubscribed = db.subscriptions[subscriber] && db.subscriptions[subscriber].includes(channel);
    res.json({ isSubscribed });
});

// --- PLAYLIST API ---
app.get('/api/playlists', (req, res) => {
    const db = loadDatabase();
    res.json(db.playlists);
});

app.get('/api/playlists/:id', (req, res) => {
    const db = loadDatabase();
    const playlist = db.playlists.find(p => p.id == req.params.id);
    if (!playlist) return res.status(404).send('Playlist not found');

    const populatedVideos = playlist.videoIds.map(vId => db.videos.find(v => v.id == vId)).filter(Boolean);
    res.json({ ...playlist, videos: populatedVideos });
});

app.post('/api/playlists', (req, res) => {
    const db = loadDatabase();
    const { name, username } = req.body;
    if (!name || !username) return res.status(400).send('Name and username required');

    const newPlaylist = {
        id: db.playlists.length + 1,
        name,
        creator: username,
        videoIds: []
    };

    db.playlists.push(newPlaylist);
    saveDatabase(db);
    res.json(newPlaylist);
});

app.post('/api/playlists/:id/add', (req, res) => {
    const db = loadDatabase();
    const { videoId } = req.body;
    const playlist = db.playlists.find(p => p.id == req.params.id);

    if (!playlist) return res.status(404).send('Playlist not found');
    if (!playlist.videoIds.includes(Number(videoId))) {
        playlist.videoIds.push(Number(videoId));
        saveDatabase(db);
    }

    res.json(playlist);
});

// --- PAGE ROUTES ---
app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`YouTube server running on port ${PORT}`);
});