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

// In-memory databases
let users = [];         // { username, password }
let videos = [];        // { id, title, videoUrl, thumbnailUrl, uploader, votes: {}, comments: [] }
let subscriptions = {}; // { username: [list of subscribed channels] }

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
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'All fields required' });
    
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already taken' });
    }

    users.push({ username, password });
    res.json({ success: true, username });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });
    
    res.json({ success: true, username });
});

// --- VIDEO API ---
app.get('/api/videos', (req, res) => {
    const formatted = videos.map(v => ({
        ...v,
        likes: Object.values(v.votes).filter(val => val === 'like').length,
        dislikes: Object.values(v.votes).filter(val => val === 'dislike').length
    }));
    res.json(formatted);
});

app.get('/api/videos/:id', (req, res) => {
    const video = videos.find(v => v.id == req.params.id);
    if (!video) return res.status(404).send('Video not found');

    res.json({
        ...video,
        likes: Object.values(video.votes).filter(val => val === 'like').length,
        dislikes: Object.values(video.votes).filter(val => val === 'dislike').length
    });
});

// Toggle Like / Dislike
app.post('/api/videos/:id/vote', (req, res) => {
    const { username, type } = req.body; 
    const video = videos.find(v => v.id == req.params.id);

    if (!video || !username) return res.status(400).send('Invalid request');

    if (video.votes[username] === type) {
        delete video.votes[username];
    } else {
        video.votes[username] = type;
    }

    const likes = Object.values(video.votes).filter(val => val === 'like').length;
    const dislikes = Object.values(video.votes).filter(val => val === 'dislike').length;

    res.json({ likes, dislikes, userVote: video.votes[username] || null });
});

// Add Comment
app.post('/api/videos/:id/comments', (req, res) => {
    const video = videos.find(v => v.id == req.params.id);
    const { text, username } = req.body;
    if (video && text) {
        video.comments.push({ username: username || 'Anonymous', text, date: new Date().toLocaleDateString() });
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
    const { title, username } = req.body;
    const videoFile = req.files['videoFile'] ? req.files['videoFile'][0].filename : null;
    const thumbnailFile = req.files['thumbnailFile'] ? req.files['thumbnailFile'][0].filename : null;

    if (!videoFile) return res.status(400).send('Video file is required.');

    const newVideo = {
        id: videos.length + 1,
        title: title || 'Untitled Video',
        uploader: username || 'Guest',
        videoUrl: `/uploads/${videoFile}`,
        thumbnailUrl: thumbnailFile ? `/uploads/${thumbnailFile}` : '/yt.png',
        votes: {}, 
        comments: []
    };

    videos.push(newVideo);
    res.redirect('/');
});

// --- CHANNEL & SUBSCRIPTION API ---
app.get('/api/channels/:name', (req, res) => {
    const channelName = req.params.name;
    const channelVideos = videos.filter(v => v.uploader === channelName);
    
    let subCount = 0;
    Object.values(subscriptions).forEach(subs => {
        if (subs.includes(channelName)) subCount++;
    });

    res.json({
        username: channelName,
        videos: channelVideos,
        subscriberCount: subCount
    });
});

app.post('/api/subscribe', (req, res) => {
    const { subscriber, channelToSubscribe } = req.body;
    if (!subscriber || !channelToSubscribe || subscriber === channelToSubscribe) {
        return res.status(400).send('Invalid request');
    }

    if (!subscriptions[subscriber]) {
        subscriptions[subscriber] = [];
    }

    const index = subscriptions[subscriber].indexOf(channelToSubscribe);
    let isSubscribed = false;

    if (index > -1) {
        subscriptions[subscriber].splice(index, 1);
    } else {
        subscriptions[subscriber].push(channelToSubscribe);
        isSubscribed = true;
    }

    let subCount = 0;
    Object.values(subscriptions).forEach(subs => {
        if (subs.includes(channelToSubscribe)) subCount++;
    });

    res.json({ isSubscribed, subscriberCount: subCount });
});

app.get('/api/is-subscribed', (req, res) => {
    const { subscriber, channel } = req.query;
    const isSubscribed = subscriptions[subscriber] && subscriptions[subscriber].includes(channel);
    res.json({ isSubscribed });
});

// --- PAGE ROUTES ---
app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.listen(PORT, () => {
    console.log(`YouTube server running on port ${PORT}`);
});