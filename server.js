/**
 * 🦂 مساعد عقروب V1.15 - السيرفر الكامل
 * تم تحديثه ليتوافق مع Render و MongoDB Atlas
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config(); // لدعم المتغيرات البيئية من ملف .env محلياً

// ============================================
// الإعدادات الأساسية
// ============================================
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;

let isDbConnected = false;

// Socket.io
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] },
    maxHttpBufferSize: 1e8
});

// ============================================
// Middleware
// ============================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public'))); // سيقرأ ملف index.html من مجلد public

// حماية مسارات API إذا لم تكن قاعدة البيانات متصلة
const dbCheckMiddleware = (req, res, next) => {
    if (!isDbConnected && req.path.startsWith('/api/') && req.path !== '/api/settings') {
        return res.json({ success: false, message: "الخدمة غير متاحة مؤقتاً، قاعدة البيانات غير متصلة" });
    }
    next();
};
app.use(dbCheckMiddleware);

// ============================================
// رفع الصور (مؤقت على Render)
// ============================================
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname))
    }),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// ============================================
// Schemas
// ============================================
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    displayName: { type: String, default: "" },
    isAdmin: { type: Boolean, default: false },
    highScore: { type: Number, default: 0 },
    sessionScore: { type: Number, default: 0 },
    energy: { type: Number, default: 200 },
    stats: {
        moves: { type: Number, default: 0 },
        maxLvl: { type: Number, default: 0 },
        level11Count: { type: Number, default: 0 }
    },
    grid: { type: Array, default: null },
    avatarUrl: { type: String, default: "" },
    kingdom: { type: String, default: "" },
    alliance: { type: String, default: "" },
    tools: {
        gem: { owned: { type: Number, default: 0 }, dailyLimit: { type: Number, default: 999 }, used: { type: Number, default: 0 } },
        upgrade: { owned: { type: Number, default: 0 }, dailyLimit: { type: Number, default: 20 }, used: { type: Number, default: 0 } },
        claw: { owned: { type: Number, default: 0 }, dailyLimit: { type: Number, default: 20 }, used: { type: Number, default: 0 } },
        wheel: { owned: { type: Number, default: 0 }, dailyLimit: { type: Number, default: 20 }, used: { type: Number, default: 0 } }
    },
    createdAt: { type: Date, default: Date.now },
    lastDailyReset: { type: Date, default: null }
});

const settingsSchema = new mongoose.Schema({
    key: { type: String, default: 'main', unique: true },
    appName: { type: String, default: "مساعد عقروب V1.15" },
    logoUrl: { type: String, default: "" },
    geminiApiKey: { type: String, default: "" },
    termsTitle: { type: String, default: "ميثاق الشرف" },
    termsText: { type: String, default: "أهلاً بك يا بطل..." },
    colors: {
        primary: { type: String, default: "#D4AF37" },
        secondary: { type: String, default: "#C41E3A" },
        bg: { type: String, default: "#0a0a0a" }
    },
    animals: { type: Object, default: {} },
    eventEndTime: { type: Date, default: null }
}, { minimize: false });

const reviewSchema = new mongoose.Schema({
    username: String,
    rating: Number,
    text: String,
    date: { type: Date, default: Date.now }
});

const achievementSchema = new mongoose.Schema({
    username: String,
    sessionScore: Number,
    moves: Number,
    rating: Number,
    comment: String,
    date: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const Review = mongoose.model('Review', reviewSchema);
const Achievement = mongoose.model('Achievement', achievementSchema);

// ============================================
// بيانات الإدارة الافتراضية
// ============================================
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// ============================================
// التهيئة و Seeding للبيانات (يقرأ JSON)
// ============================================
function getDefaultAnimals() {
    return {
        '0': { icon: '', name: 'فارغ' },
        '1': { icon: '🐭', name: 'فأر' }, '2': { icon: '🐰', name: 'أرنب' },
        '3': { icon: '🦊', name: 'ثعلب' }, '4': { icon: '🐺', name: 'ذئب' },
        '5': { icon: '🦁', name: 'أسد' }, '6': { icon: '🐯', name: 'نمر' },
        '7': { icon: '🦅', name: 'نسر' }, '8': { icon: '🐉', name: 'تنين' },
        '9': { icon: '🔥', name: 'عنقاء' }, '10': { icon: '⚡', name: 'برق' },
        '11': { icon: '👑', name: 'ملك' }
    };
}

async function seedDatabase() {
    try {
        const settingsCount = await Settings.countDocuments();
        if (settingsCount === 0) {
            let initialData = {
                key: 'main',
                appName: "مساعد عقروب V1.15",
                animals: getDefaultAnimals()
            };

            // قراءة ملف settings_db.json إذا كان موجوداً
            if (fs.existsSync(path.join(__dirname, 'settings_db.json'))) {
                const localSettings = JSON.parse(fs.readFileSync(path.join(__dirname, 'settings_db.json'), 'utf-8'));
                // مسح مفتاح Gemini للأمان (ليتم إدخاله من لوحة التحكم أو المتغيرات)
                if (localSettings.geminiApiKey) localSettings.geminiApiKey = ""; 
                initialData = { ...initialData, ...localSettings, key: 'main' };
                console.log('✅ تم سحب الإعدادات من ملف settings_db.json');
            }

            await Settings.create(initialData);
        }

        const reviewsCount = await Review.countDocuments();
        if (reviewsCount === 0) {
            if (fs.existsSync(path.join(__dirname, 'reviews_db.json'))) {
                const localReviews = JSON.parse(fs.readFileSync(path.join(__dirname, 'reviews_db.json'), 'utf-8'));
                if (localReviews.reviews && localReviews.reviews.length > 0) {
                    await Review.insertMany(localReviews.reviews);
                    console.log('✅ تم سحب التقييمات من ملف reviews_db.json');
                }
            }
        }
    } catch (err) {
        console.error('❌ خطأ أثناء تغذية قاعدة البيانات:', err.message);
    }
}

const connectDB = async () => {
    try {
        if (!MONGODB_URI) {
            console.warn('⚠️ المتغير MONGODB_URI غير موجود - السيرفر سيعمل بدون قاعدة بيانات (أغلب الوظائف ستتعطل)');
            return false;
        }
        await mongoose.connect(MONGODB_URI);
        isDbConnected = true;
        console.log('✅ متصل بقاعدة بيانات MongoDB Atlas');
        await seedDatabase();
        return true;
    } catch (err) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
        isDbConnected = false;
        return false;
    }
};

// ============================================
// دوال مساعدة
// ============================================
function checkAdmin(user, pass) {
    return (user === ADMIN_USER && pass === ADMIN_PASS) || (user && user.isAdmin && user.password === pass);
}

async function resetDailyUsage(user) {
    const now = new Date();
    const egyptTime = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
    const lastReset = user.lastDailyReset ? new Date(user.lastDailyReset.toLocaleString("en-US", { timeZone: "Africa/Cairo" })) : null;

    if (!lastReset || egyptTime.getDate() !== lastReset.getDate() || egyptTime.getMonth() !== lastReset.getMonth() || egyptTime.getFullYear() !== lastReset.getFullYear()) {
        user.tools.gem.used = 0; user.tools.upgrade.used = 0; user.tools.claw.used = 0; user.tools.wheel.used = 0;
        user.sessionScore = 0; user.stats.level11Count = 0;
        user.lastDailyReset = now;
        await user.save();
        return true;
    }
    return false;
}

// ============================================
// API Routes
// ============================================

app.get('/api/settings', async (req, res) => {
    try {
        if (!isDbConnected) {
            return res.json({ appName: "مساعد عقروب V1.15", animals: getDefaultAnimals() });
        }
        let settings = await Settings.findOne({ key: 'main' });
        const publicSettings = settings ? settings.toObject() : { appName: "مساعد عقروب V1.15", animals: getDefaultAnimals() };
        delete publicSettings.geminiApiKey; // عدم إرسال المفتاح للعميل
        res.json(publicSettings);
    } catch (err) {
        res.json({ appName: "مساعد عقروب V1.15", animals: getDefaultAnimals() });
    }
});

app.get('/api/event/timeleft', async (req, res) => {
    try {
        const settings = await Settings.findOne({ key: 'main' });
        const endTime = settings?.eventEndTime;
        if (!endTime) return res.json({ success: false, message: "لا يوجد حدث" });

        const now = new Date();
        const diff = new Date(endTime) - now;
        if (diff <= 0) return res.json({ success: false, message: "انتهى الحدث" });

        res.json({
            success: true,
            timeLeft: {
                days: Math.floor(diff / (1000 * 60 * 60 * 24)),
                hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
                seconds: Math.floor((diff % (1000 * 60)) / 1000)
            }
        });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.json({ success: false, message: "أدخل البيانات كاملة" });

        if (username === ADMIN_USER && password === ADMIN_PASS) {
            let admin = await User.findOne({ username: ADMIN_USER });
            if (!admin) {
                admin = await User.create({
                    username: ADMIN_USER, password: ADMIN_PASS, isAdmin: true, displayName: "المدير", kingdom: "القيادة",
                    tools: { gem: { owned: 999 }, upgrade: { owned: 99 }, claw: { owned: 99 }, wheel: { owned: 99 } }
                });
            }
        }

        const user = await User.findOne({ username });
        if (!user) return res.json({ success: false, message: "الحساب غير موجود" });
        if (user.password !== password) return res.json({ success: false, message: "كلمة المرور خطأ" });

        await resetDailyUsage(user);

        res.json({
            success: true, isAdmin: user.isAdmin || false,
            userData: {
                highScore: user.highScore || 0, sessionScore: user.sessionScore || 0, energy: user.energy ?? 200,
                grid: user.grid, stats: user.stats || {}, displayName: user.displayName || "",
                kingdom: user.kingdom || "", alliance: user.alliance || "", tools: user.tools || {}
            }
        });
    } catch (err) { res.status(500).json({ success: false, message: "خطأ في السيرفر" }); }
});

app.post('/api/user/save', async (req, res) => {
    try {
        const { username, password, grid, energy, sessionScore } = req.body;
        const user = await User.findOne({ username });
        if (user && user.password === password) {
            if (grid) user.grid = grid;
            if (energy !== undefined) user.energy = Math.max(0, Math.min(200, energy));
            if (sessionScore !== undefined) user.sessionScore = sessionScore;
            if (user.sessionScore > (user.highScore || 0)) user.highScore = user.sessionScore;
            await user.save();
            res.json({ success: true });
        } else { res.status(403).json({ success: false }); }
    } catch (err) { res.status(500).json({ success: false }); }
});

// Admin, Settings, Leaderboard (Brevity: kept same flow)
app.get('/api/leaderboard', async (req, res) => {
    try {
        const users = await User.find({}).sort({ highScore: -1 }).limit(10).select('username highScore displayName');
        res.json(users.map(u => ({ username: u.username, displayName: u.displayName || u.username, score: u.highScore || 0 })));
    } catch (err) { res.json([]); }
});

app.post('/api/settings', async (req, res) => {
    try {
        const { adminUser, adminPass, newSettings } = req.body;
        if (!checkAdmin(adminUser, adminPass)) return res.json({ success: false, message: "غير مصرح" });
        
        let settings = await Settings.findOne({ key: 'main' });
        if (!settings) settings = new Settings({ key: 'main' });

        if (newSettings.appName) settings.appName = newSettings.appName;
        if (newSettings.geminiApiKey !== undefined) settings.geminiApiKey = newSettings.geminiApiKey;

        await settings.save();
        io.emit('settings_updated', settings.toObject());
        res.json({ success: true, message: "تم الحفظ" });
    } catch (err) { res.json({ success: false, message: "خطأ" }); }
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

app.post('/api/ai/analyze', async (req, res) => {
    try {
        const { username, password, grid, question, context } = req.body;
        const user = await User.findOne({ username });
        if (!user || user.password !== password) return res.status(403).json({ success: false, message: "غير مصرح" });

        const settings = await Settings.findOne({ key: 'main' });
        const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY; // يقرأ من الإعدادات أو البيئة
        if (!apiKey) return res.json({ success: false, message: "لم يتم تكوين Gemini API" });

        const prompt = `الشبكة الحالية:\n${JSON.stringify(grid)}\nالسؤال: ${question}\nأجب باختصار بالعربية وادعم إجابتك.`;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } })
        });
        const data = await response.json();
        res.json({ success: true, response: data.candidates?.[0]?.content?.parts?.[0]?.text || "لا إجابة" });
    } catch (err) { res.json({ success: false, message: "خطأ في الاتصال" }); }
});

// ============================================
// تشغيل السيرفر
// ============================================
connectDB().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🦂 السيرفر شغال على ${PORT}`);
    });
});