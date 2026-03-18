const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;
const LOCAL_DB_FILE = path.join(__dirname, 'local-storage.json');

let isDbConnected = false;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    const publicIndex = path.join(__dirname, 'public', 'index.html');
    const rootIndex = path.join(__dirname, 'index.html');

    if (fs.existsSync(publicIndex)) {
        res.sendFile(publicIndex);
    } else if (fs.existsSync(rootIndex)) {
        res.sendFile(rootIndex);
    } else {
        res.send('<h1>خطأ: لم يتم العثور على ملف الواجهة</h1><p>يرجى التأكد من أنك قمت برفع ملف index.html إما في المجلد الرئيسي أو داخل مجلد باسم public.</p>');
    }
});

function createEmptyGrid() {
    return Array.from({ length: 4 }, () => Array(4).fill(0));
}

function spawnRandomOnGrid(grid) {
    const empty = [];
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            if (!grid[r][c]) empty.push({ r, c });
        }
    }
    if (!empty.length) return grid;
    const spot = empty[Math.floor(Math.random() * empty.length)];
    grid[spot.r][spot.c] = Math.floor(Math.random() * 7) + 1;
    return grid;
}

function createInitialGrid() {
    const grid = createEmptyGrid();
    spawnRandomOnGrid(grid);
    spawnRandomOnGrid(grid);
    return grid;
}

function isValidGrid(grid) {
    return Array.isArray(grid) && grid.length === 4 && grid.every(row => Array.isArray(row) && row.length === 4);
}

function isGridEmpty(grid) {
    if (!isValidGrid(grid)) return true;
    return grid.every(row => row.every(cell => !cell));
}

function getMaxLevelFromGrid(grid) {
    if (!isValidGrid(grid)) return 0;
    return Math.max(0, ...grid.flat().map(v => Number(v) || 0));
}

function defaultToolsState() {
    return {
        gem: { owned: 0, dailyLimit: 999, used: 0 },
        upgrade: { owned: 0, dailyLimit: 20, used: 0 },
        claw: { owned: 0, dailyLimit: 20, used: 0 },
        wheel: { owned: 0, dailyLimit: 20, used: 0 }
    };
}

function defaultAnimals() {
    return {
        '0': { icon: '' },
        '1': { icon: '🐭', name: 'المستوى 1' },
        '2': { icon: '🐰', name: 'المستوى 2' },
        '3': { icon: '🦊', name: 'المستوى 3' },
        '4': { icon: '🐺', name: 'المستوى 4' },
        '5': { icon: '🦁', name: 'المستوى 5' },
        '6': { icon: '🐯', name: 'المستوى 6' },
        '7': { icon: '🦅', name: 'المستوى 7' },
        '8': { icon: '🐉', name: 'المستوى 8' },
        '9': { icon: '🔥', name: 'المستوى 9' },
        '10': { icon: '⚡', name: 'المستوى 10' },
        '11': { icon: '👑', name: 'المستوى 11' }
    };
}

function defaultSettingsData() {
    return {
        key: 'main',
        appName: 'مساعد عقروب V1.16',
        logoUrl: '',
        geminiApiKey: '',
        animals: defaultAnimals(),
        toolsConfig: {},
        eventEndTime: null,
        dailyLevel11Goal: 3
    };
}

function createDefaultUser({ username, password, isAdmin = false, displayName = '' }) {
    const grid = createInitialGrid();
    return normalizeUserRecord({
        username,
        password,
        displayName: displayName || username,
        kingdom: '',
        alliance: '',
        avatar: '🦂',
        isAdmin,
        highScore: 0,
        totalScore: 0,
        sessionScore: 0,
        highestLevel: Math.max(1, getMaxLevelFromGrid(grid)),
        totalMoves: 0,
        movesThisRound: 0,
        level11Count: 0,
        level11Today: 0,
        energy: 200,
        grid,
        tools: defaultToolsState(),
        lastDailyReset: null,
        createdAt: new Date().toISOString()
    });
}

function normalizeUserRecord(user) {
    const normalized = { ...user };
    normalized.displayName = normalized.displayName || normalized.username || '';
    normalized.kingdom = normalized.kingdom || '';
    normalized.alliance = normalized.alliance || '';
    normalized.avatar = normalized.avatar || '🦂';
    normalized.isAdmin = !!normalized.isAdmin;
    normalized.highScore = Math.max(0, Number(normalized.highScore) || 0);
    normalized.totalScore = Math.max(0, Number(normalized.totalScore) || 0);
    normalized.sessionScore = Math.max(0, Number(normalized.sessionScore) || 0);
    normalized.totalMoves = Math.max(0, Number(normalized.totalMoves) || 0);
    normalized.movesThisRound = Math.max(0, Number(normalized.movesThisRound) || 0);
    normalized.level11Count = Math.max(0, Number(normalized.level11Count) || 0);
    normalized.level11Today = Math.max(0, Number(normalized.level11Today) || 0);
    normalized.energy = Math.max(0, Math.min(200, Number(normalized.energy) || 0));
    normalized.grid = isValidGrid(normalized.grid) && !isGridEmpty(normalized.grid) ? normalized.grid : createInitialGrid();
    normalized.highestLevel = Math.max(Number(normalized.highestLevel) || 0, getMaxLevelFromGrid(normalized.grid));
    normalized.tools = normalized.tools || defaultToolsState();

    const defaults = defaultToolsState();
    for (const key of Object.keys(defaults)) {
        normalized.tools[key] = normalized.tools[key] || {};
        normalized.tools[key].owned = Math.max(0, Number(normalized.tools[key].owned) || 0);
        normalized.tools[key].used = Math.max(0, Number(normalized.tools[key].used) || 0);
        normalized.tools[key].dailyLimit = Math.max(0, Number(normalized.tools[key].dailyLimit) || defaults[key].dailyLimit);
    }

    if (!normalized.createdAt) normalized.createdAt = new Date().toISOString();
    return normalized;
}

function readLocalStore() {
    try {
        if (!fs.existsSync(LOCAL_DB_FILE)) {
            const fresh = { users: [], settings: defaultSettingsData(), reviews: [] };
            fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(fresh, null, 2), 'utf8');
            return fresh;
        }
        const parsed = JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8'));
        return {
            users: Array.isArray(parsed.users) ? parsed.users.map(normalizeUserRecord) : [],
            settings: { ...defaultSettingsData(), ...(parsed.settings || {}) },
            reviews: Array.isArray(parsed.reviews) ? parsed.reviews : []
        };
    } catch {
        return { users: [], settings: defaultSettingsData(), reviews: [] };
    }
}

function writeLocalStore(store) {
    const safe = {
        users: Array.isArray(store.users) ? store.users.map(normalizeUserRecord) : [],
        settings: { ...defaultSettingsData(), ...(store.settings || {}) },
        reviews: Array.isArray(store.reviews) ? store.reviews : []
    };
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(safe, null, 2), 'utf8');
}

function sanitizeUserForClient(user) {
    const obj = user && user.toObject ? user.toObject() : { ...(user || {}) };
    delete obj.password;
    return obj;
}

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    displayName: { type: String, default: '' },
    kingdom: { type: String, default: '' },
    alliance: { type: String, default: '' },
    avatar: { type: String, default: '🦂' },
    isAdmin: { type: Boolean, default: false },
    highScore: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    sessionScore: { type: Number, default: 0 },
    highestLevel: { type: Number, default: 0 },
    totalMoves: { type: Number, default: 0 },
    movesThisRound: { type: Number, default: 0 },
    level11Count: { type: Number, default: 0 },
    level11Today: { type: Number, default: 0 },
    energy: { type: Number, default: 200 },
    grid: { type: Array, default: createInitialGrid },
    tools: {
        gem: { owned: { type: Number, default: 0 }, dailyLimit: { type: Number, default: 999 }, used: { type: Number, default: 0 } },
        upgrade: { owned: { type: Number, default: 0 }, dailyLimit: { type: Number, default: 20 }, used: { type: Number, default: 0 } },
        claw: { owned: { type: Number, default: 0 }, dailyLimit: { type: Number, default: 20 }, used: { type: Number, default: 0 } },
        wheel: { owned: { type: Number, default: 0 }, dailyLimit: { type: Number, default: 20 }, used: { type: Number, default: 0 } }
    },
    lastDailyReset: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
    key: { type: String, default: 'main', unique: true },
    appName: { type: String, default: 'مساعد عقروب V1.16' },
    logoUrl: { type: String, default: '' },
    geminiApiKey: { type: String, default: '' },
    animals: { type: Object, default: {} },
    toolsConfig: { type: Object, default: {} },
    eventEndTime: { type: Date, default: null },
    dailyLevel11Goal: { type: Number, default: 3 }
}, { minimize: false });

const reviewSchema = new mongoose.Schema({
    username: String,
    rating: Number,
    text: String,
    date: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const Review = mongoose.model('Review', reviewSchema);

async function resetDailyUsageIfNeeded(user, persistFn = null) {
    const now = new Date();
    const egyptTime = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    const lastReset = user.lastDailyReset
        ? new Date(new Date(user.lastDailyReset).toLocaleString('en-US', { timeZone: 'Africa/Cairo' }))
        : null;

    let needsReset = false;
    if (!lastReset) {
        needsReset = true;
    } else {
        const lastResetTarget = new Date(lastReset);
        lastResetTarget.setHours(2, 0, 0, 0);
        if (lastReset < lastResetTarget) lastResetTarget.setDate(lastResetTarget.getDate() - 1);

        const currentTarget = new Date(egyptTime);
        currentTarget.setHours(2, 0, 0, 0);
        if (egyptTime < currentTarget) currentTarget.setDate(currentTarget.getDate() - 1);

        if (currentTarget.getTime() > lastResetTarget.getTime()) needsReset = true;
    }

    if (!needsReset) return;

    if (user.tools) {
        if (user.tools.gem) user.tools.gem.used = 0;
        if (user.tools.upgrade) { user.tools.upgrade.used = 0; user.tools.upgrade.dailyLimit = 20; }
        if (user.tools.claw) { user.tools.claw.used = 0; user.tools.claw.dailyLimit = 20; }
        if (user.tools.wheel) { user.tools.wheel.used = 0; user.tools.wheel.dailyLimit = 20; }
    }
    user.level11Today = 0;
    user.lastDailyReset = now;

    if (persistFn) {
        await persistFn(user);
    } else if (typeof user.save === 'function') {
        await user.save();
    }
}

async function getSettingsRecord() {
    if (isDbConnected) {
        let settings = await Settings.findOne({ key: 'main' });
        if (!settings) settings = await Settings.create(defaultSettingsData());
        return settings;
    }
    const store = readLocalStore();
    return store.settings;
}

async function verifyAdmin(adminUser, adminPass) {
    if (isDbConnected) {
        const admin = await User.findOne({ username: adminUser, password: adminPass });
        if (!admin || !admin.isAdmin) return null;
        return admin;
    }
    const store = readLocalStore();
    const admin = store.users.find(u => u.username === adminUser && u.password === adminPass && u.isAdmin);
    return admin || null;
}

app.get('/api/settings', async (req, res) => {
    try {
        const settings = await getSettingsRecord();
        const publicSettings = settings.toObject ? settings.toObject() : { ...settings };
        delete publicSettings.geminiApiKey;
        res.json(publicSettings);
    } catch {
        res.json({});
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.json({ success: false, message: 'البيانات غير مكتملة' });
        }

        if (isDbConnected) {
            if (username === 'admin' && password === 'admin123') {
                let admin = await User.findOne({ username: 'admin' });
                if (!admin) {
                    admin = await User.create(createDefaultUser({ username: 'admin', password: 'admin123', isAdmin: true, displayName: 'المدير العام' }));
                }
            }

            let user = await User.findOne({ username });
            if (!user) {
                user = await User.create(createDefaultUser({ username, password }));
            } else if (user.password !== password) {
                return res.json({ success: false, message: 'كلمة المرور غير صحيحة' });
            }

            if (!isValidGrid(user.grid) || isGridEmpty(user.grid)) {
                user.grid = createInitialGrid();
                user.highestLevel = Math.max(user.highestLevel || 0, getMaxLevelFromGrid(user.grid));
                await user.save();
            }

            await resetDailyUsageIfNeeded(user);
            return res.json({ success: true, isAdmin: user.isAdmin, userData: sanitizeUserForClient(user) });
        }

        const store = readLocalStore();
        if (username === 'admin' && password === 'admin123' && !store.users.find(u => u.username === 'admin')) {
            store.users.push(createDefaultUser({ username: 'admin', password: 'admin123', isAdmin: true, displayName: 'المدير العام' }));
        }

        let user = store.users.find(u => u.username === username);
        if (!user) {
            user = createDefaultUser({ username, password });
            store.users.push(user);
        } else if (user.password !== password) {
            return res.json({ success: false, message: 'كلمة المرور غير صحيحة' });
        }

        user = normalizeUserRecord(user);
        const idx = store.users.findIndex(u => u.username === username);
        store.users[idx] = user;
        await resetDailyUsageIfNeeded(user, async () => writeLocalStore(store));
        writeLocalStore(store);
        return res.json({ success: true, isAdmin: user.isAdmin, userData: sanitizeUserForClient(user) });
    } catch {
        res.status(500).json({ success: false, message: 'خطأ داخلي' });
    }
});

app.post('/api/user/save', async (req, res) => {
    try {
        const {
            username, password, grid, energy, sessionScore, totalScore, highestLevel,
            totalMoves, movesThisRound, level11Count, level11Today, tools,
            displayName, kingdom, alliance, avatar
        } = req.body;

        if (isDbConnected) {
            const user = await User.findOne({ username, password });
            if (!user) return res.status(403).json({ success: false, message: 'بيانات الدخول غير صحيحة' });

            if (isValidGrid(grid)) {
                user.grid = grid;
                user.highestLevel = Math.max(user.highestLevel || 0, getMaxLevelFromGrid(grid));
            }
            if (energy !== undefined) user.energy = Math.max(0, Math.min(200, Number(energy) || 0));
            if (sessionScore !== undefined) {
                user.sessionScore = Math.max(0, Number(sessionScore) || 0);
                user.highScore = Math.max(user.highScore || 0, user.sessionScore);
            }
            if (totalScore !== undefined) user.totalScore = Math.max(user.totalScore || 0, Number(totalScore) || 0);
            if (highestLevel !== undefined) user.highestLevel = Math.max(user.highestLevel || 0, Number(highestLevel) || 0);
            if (totalMoves !== undefined) user.totalMoves = Math.max(0, Number(totalMoves) || 0);
            if (movesThisRound !== undefined) user.movesThisRound = Math.max(0, Number(movesThisRound) || 0);
            if (level11Count !== undefined) user.level11Count = Math.max(0, Number(level11Count) || 0);
            if (level11Today !== undefined) user.level11Today = Math.max(0, Number(level11Today) || 0);
            if (tools) user.tools = tools;
            if (displayName !== undefined) user.displayName = displayName;
            if (kingdom !== undefined) user.kingdom = kingdom;
            if (alliance !== undefined) user.alliance = alliance;
            if (avatar !== undefined) user.avatar = avatar || '🦂';

            await user.save();
            return res.json({ success: true, user: sanitizeUserForClient(user) });
        }

        const store = readLocalStore();
        const idx = store.users.findIndex(u => u.username === username && u.password === password);
        if (idx === -1) return res.status(403).json({ success: false, message: 'بيانات الدخول غير صحيحة' });

        const user = normalizeUserRecord({ ...store.users[idx] });
        if (isValidGrid(grid)) {
            user.grid = grid;
            user.highestLevel = Math.max(user.highestLevel || 0, getMaxLevelFromGrid(grid));
        }
        if (energy !== undefined) user.energy = Math.max(0, Math.min(200, Number(energy) || 0));
        if (sessionScore !== undefined) {
            user.sessionScore = Math.max(0, Number(sessionScore) || 0);
            user.highScore = Math.max(user.highScore || 0, user.sessionScore);
        }
        if (totalScore !== undefined) user.totalScore = Math.max(user.totalScore || 0, Number(totalScore) || 0);
        if (highestLevel !== undefined) user.highestLevel = Math.max(user.highestLevel || 0, Number(highestLevel) || 0);
        if (totalMoves !== undefined) user.totalMoves = Math.max(0, Number(totalMoves) || 0);
        if (movesThisRound !== undefined) user.movesThisRound = Math.max(0, Number(movesThisRound) || 0);
        if (level11Count !== undefined) user.level11Count = Math.max(0, Number(level11Count) || 0);
        if (level11Today !== undefined) user.level11Today = Math.max(0, Number(level11Today) || 0);
        if (tools) user.tools = normalizeUserRecord({ tools }).tools;
        if (displayName !== undefined) user.displayName = displayName;
        if (kingdom !== undefined) user.kingdom = kingdom;
        if (alliance !== undefined) user.alliance = alliance;
        if (avatar !== undefined) user.avatar = avatar || '🦂';

        store.users[idx] = normalizeUserRecord(user);
        writeLocalStore(store);
        return res.json({ success: true, user: sanitizeUserForClient(store.users[idx]) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'تعذر حفظ البيانات' });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        if (isDbConnected) {
            const users = await User.find({})
                .select('username displayName avatar kingdom alliance highScore totalScore highestLevel level11Count')
                .sort({ highScore: -1, totalScore: -1, highestLevel: -1 })
                .limit(50);
            return res.json({ success: true, users });
        }

        const store = readLocalStore();
        const users = store.users
            .map(u => sanitizeUserForClient(u))
            .sort((a, b) => (b.highScore || 0) - (a.highScore || 0) || (b.totalScore || 0) - (a.totalScore || 0) || (b.highestLevel || 0) - (a.highestLevel || 0))
            .slice(0, 50)
            .map(u => ({
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                kingdom: u.kingdom,
                alliance: u.alliance,
                highScore: u.highScore,
                totalScore: u.totalScore,
                highestLevel: u.highestLevel,
                level11Count: u.level11Count
            }));
        return res.json({ success: true, users });
    } catch {
        res.json({ success: false, users: [] });
    }
});

app.post('/api/ai/analyze', async (req, res) => {
    try {
        const { username, password, prompt } = req.body;
        let userExists = false;
        let apiKey = process.env.GEMINI_API_KEY || '';

        if (isDbConnected) {
            const user = await User.findOne({ username, password });
            if (!user) return res.json({ success: false, message: 'غير مصرح' });
            userExists = true;
            const settings = await Settings.findOne({ key: 'main' });
            apiKey = settings?.geminiApiKey || apiKey;
        } else {
            const store = readLocalStore();
            userExists = !!store.users.find(u => u.username === username && u.password === password);
            if (!userExists) return res.json({ success: false, message: 'غير مصرح' });
            apiKey = store.settings?.geminiApiKey || apiKey;
        }

        if (!userExists) return res.json({ success: false, message: 'غير مصرح' });
        if (!apiKey) return res.json({ success: false, message: 'لم يتم تكوين مفتاح الذكاء الاصطناعي.' });

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 250 }
            })
        });

        const data = await response.json();
        if (data.candidates && data.candidates[0]) {
            return res.json({ success: true, response: data.candidates[0].content.parts[0].text });
        }
        return res.json({ success: false });
    } catch {
        res.json({ success: false });
    }
});

app.post('/api/settings', async (req, res) => {
    try {
        const { adminUser, adminPass, newSettings } = req.body;
        const admin = await verifyAdmin(adminUser, adminPass);
        if (!admin || !admin.isAdmin) return res.status(403).json({ success: false, message: 'غير مصرح' });

        if (isDbConnected) {
            let settings = await Settings.findOne({ key: 'main' });
            if (!settings) settings = new Settings(defaultSettingsData());

            if (newSettings.appName !== undefined) settings.appName = newSettings.appName;
            if (newSettings.logoUrl !== undefined) settings.logoUrl = newSettings.logoUrl;
            if (newSettings.eventEndTime !== undefined) settings.eventEndTime = newSettings.eventEndTime || null;
            if (newSettings.dailyLevel11Goal !== undefined) settings.dailyLevel11Goal = Number(newSettings.dailyLevel11Goal) || 3;
            if (newSettings.geminiApiKey !== undefined && String(newSettings.geminiApiKey).trim() !== '') settings.geminiApiKey = newSettings.geminiApiKey;
            if (newSettings.animals !== undefined) settings.animals = newSettings.animals;
            if (newSettings.toolsConfig !== undefined) settings.toolsConfig = newSettings.toolsConfig;

            await settings.save();
            return res.json({ success: true });
        }

        const store = readLocalStore();
        store.settings = { ...store.settings, ...newSettings };
        if (newSettings.geminiApiKey !== undefined && String(newSettings.geminiApiKey).trim() === '') {
            delete store.settings.geminiApiKey;
        }
        writeLocalStore(store);
        return res.json({ success: true });
    } catch {
        res.status(500).json({ success: false, message: 'تعذر حفظ الإعدادات' });
    }
});

app.post('/api/admin/users', async (req, res) => {
    try {
        const { adminUser, adminPass } = req.body;
        const admin = await verifyAdmin(adminUser, adminPass);
        if (!admin || !admin.isAdmin) return res.status(403).json({ success: false, message: 'غير مصرح' });

        if (isDbConnected) {
            const users = await User.find({}).select('-password -grid').sort({ highScore: -1, totalScore: -1, createdAt: 1 });
            return res.json({ success: true, users: users.map(sanitizeUserForClient) });
        }

        const store = readLocalStore();
        const users = store.users
            .map(u => sanitizeUserForClient(u))
            .sort((a, b) => (b.highScore || 0) - (a.highScore || 0) || (b.totalScore || 0) - (a.totalScore || 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
        return res.json({ success: true, users });
    } catch {
        res.json({ success: false, users: [] });
    }
});

app.post('/api/admin/set-role', async (req, res) => {
    try {
        const { adminUser, adminPass, targetUsername, isAdmin } = req.body;
        const admin = await verifyAdmin(adminUser, adminPass);
        if (!admin || !admin.isAdmin) return res.status(403).json({ success: false, message: 'غير مصرح' });
        if (!targetUsername || targetUsername === 'admin') {
            return res.json({ success: false, message: 'لا يمكن تعديل هذا الحساب' });
        }

        if (isDbConnected) {
            const target = await User.findOne({ username: targetUsername });
            if (!target) return res.json({ success: false, message: 'المستخدم غير موجود' });
            target.isAdmin = !!isAdmin;
            await target.save();
            return res.json({ success: true, user: sanitizeUserForClient(target) });
        }

        const store = readLocalStore();
        const idx = store.users.findIndex(u => u.username === targetUsername);
        if (idx === -1) return res.json({ success: false, message: 'المستخدم غير موجود' });
        store.users[idx].isAdmin = !!isAdmin;
        writeLocalStore(store);
        return res.json({ success: true, user: sanitizeUserForClient(store.users[idx]) });
    } catch {
        res.json({ success: false, message: 'تعذر تحديث الصلاحية' });
    }
});

app.post('/api/review/add', async (req, res) => {
    try {
        const payload = {
            username: req.body.username || '',
            rating: Number(req.body.rating) || 0,
            text: req.body.text || '',
            date: new Date().toISOString()
        };

        if (isDbConnected) {
            await Review.create(payload);
        } else {
            const store = readLocalStore();
            store.reviews.unshift(payload);
            writeLocalStore(store);
        }
        res.json({ success: true });
    } catch {
        res.json({ success: false });
    }
});

app.get('/api/admin/reviews', async (req, res) => {
    try {
        const { adminUser, adminPass } = req.query;
        const admin = await verifyAdmin(adminUser, adminPass);
        if (!admin || !admin.isAdmin) return res.status(403).json({ success: false, reviews: [] });

        if (isDbConnected) {
            const reviews = await Review.find({}).sort({ date: -1 }).limit(100);
            return res.json({ success: true, reviews });
        }

        const store = readLocalStore();
        const reviews = [...store.reviews].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 100);
        return res.json({ success: true, reviews });
    } catch {
        res.json({ success: false, reviews: [] });
    }
});

const connectDB = async () => {
    try {
        if (!MONGODB_URI) {
            console.warn('⚠️ MONGODB_URI غير موجود. سيتم استخدام التخزين المحلي داخل local-storage.json');
            return false;
        }
        await mongoose.connect(MONGODB_URI);
        isDbConnected = true;
        console.log('✅ متصل بقاعدة بيانات MongoDB Atlas');

        if ((await Settings.countDocuments()) === 0) {
            await Settings.create(defaultSettingsData());
            console.log('✅ تم إنشاء إعدادات افتراضية');
        }
    } catch (err) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
        isDbConnected = false;
        console.warn('⚠️ سيتم استخدام التخزين المحلي داخل local-storage.json');
    }
};

connectDB().then(() => {
    if (!isDbConnected) {
        const store = readLocalStore();
        writeLocalStore(store);
    }
    server.listen(PORT, '0.0.0.0', () => console.log(`🦂 السيرفر يعمل على المنفذ ${PORT}`));
});
