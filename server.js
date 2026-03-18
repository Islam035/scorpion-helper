/**
 * 🦂 مساعد عقروب V13 - السيرفر
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

// ============================================
// إعدادات أساسية
// ============================================
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;

// Socket.io
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// ============================================
// Middleware
// ============================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// رفع الصور
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
// MongoDB
// ============================================
const connectDB = async () => {
    try {
        if (!MONGODB_URI) {
            console.log('⚠️ لا يوجد MongoDB - السيرفر سيعمل بدون قاعدة');
            return false;
        }
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB متصل');
        await initSettings();
        return true;
    } catch (err) {
        console.error('❌ MongoDB خطأ:', err.message);
        return false;
    }
};

// ============================================
// Schemas
// ============================================
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    displayName: { type: String, default: "" },
    isAdmin: { type: Boolean, default: false },
    highScore: { type: Number, default: 0 },
    energy: { type: Number, default: 200 },
    stats: {
        moves: { type: Number, default: 0 },
        maxLvl: { type: Number, default: 0 },
        level11Merges: { type: Number, default: 0 }
    },
    grid: { type: Array, default: null },
    kingdom: { type: String, default: "" },
    alliance: { type: String, default: "" },
    tools: {
        gem: { owned: { type: Number, default: 0 } },
        upgrade: { owned: { type: Number, default: 0 } },
        claw: { owned: { type: Number, default: 0 } },
        wheel: { owned: { type: Number, default: 0 } }
    },
    createdAt: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
    key: { type: String, default: 'main', unique: true },
    appName: { type: String, default: "مساعد عقروب V13" },
    logoUrl: { type: String, default: "" },
    eventEndDate: { type: Date, default: null }
});

const reviewSchema = new mongoose.Schema({
    username: String,
    rating: Number,
    text: String,
    date: { type: Date, default: Date.now }
});

const achievementSchema = new mongoose.Schema({
    username: String,
    score: Number,
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
// بيانات الأدمن
// ============================================
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// ============================================
// الحيوانات
// ============================================
const ANIMALS = {
    0: { icon: '', name: 'فارغ' },
    1: { icon: '🐭', name: 'فأر' },
    2: { icon: '🐰', name: 'أرنب' },
    3: { icon: '🦊', name: 'ثعلب' },
    4: { icon: '🐺', name: 'ذئب' },
    5: { icon: '🦁', name: 'أسد' },
    6: { icon: '🐯', name: 'نمر' },
    7: { icon: '🦅', name: 'نسر' },
    8: { icon: '🐉', name: 'تنين' },
    9: { icon: '🔥', name: 'عنقاء' },
    10: { icon: '⚡', name: 'برق' },
    11: { icon: '👑', name: 'ملك' }
};

// ============================================
// تهيئة الإعدادات
// ============================================
async function initSettings() {
    let settings = await Settings.findOne({ key: 'main' });
    if (!settings) {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 1);
        endDate.setHours(endDate.getHours() + 21);
        
        settings = await Settings.create({
            key: 'main',
            appName: "مساعد عقروب V13",
            eventEndDate: endDate
        });
        console.log('✅ تم إنشاء الإعدادات');
    }
}

// ============================================
// دوال مساعدة
// ============================================
function checkAdmin(user, pass) {
    return (user === ADMIN_USER && pass === ADMIN_PASS) || (user && user.isAdmin && user.password === pass);
}

// ============================================
// API Routes
// ============================================

// الإعدادات
app.get('/api/settings', async (req, res) => {
    try {
        let settings = await Settings.findOne({ key: 'main' });
        res.json({
            appName: settings?.appName || "مساعد عقروب V13",
            logoUrl: settings?.logoUrl || "",
            animals: ANIMALS,
            eventEndDate: settings?.eventEndDate
        });
    } catch (err) {
        res.json({ appName: "مساعد عقروب", animals: ANIMALS });
    }
});

// الوقت المتبقي
app.get('/api/event/timeleft', async (req, res) => {
    try {
        const settings = await Settings.findOne({ key: 'main' });
        const endDate = settings?.eventEndDate;
        
        if (!endDate) {
            return res.json({ success: false, message: "لا يوجد حدث" });
        }
        
        const now = new Date();
        const end = new Date(endDate);
        const diff = end - now;
        
        if (diff <= 0) {
            return res.json({ success: false, message: "انتهى الحدث" });
        }
        
        res.json({
            success: true,
            timeLeft: {
                days: Math.floor(diff / (1000 * 60 * 60 * 24)),
                hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
                seconds: Math.floor((diff % (1000 * 60)) / 1000)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.json({ success: false, message: "أدخل البيانات كاملة" });
        }

        // إنشاء أدمن افتراضي
        if (username === ADMIN_USER && password === ADMIN_PASS) {
            let admin = await User.findOne({ username: ADMIN_USER });
            if (!admin) {
                admin = await User.create({
                    username: ADMIN_USER,
                    password: ADMIN_PASS,
                    isAdmin: true,
                    displayName: "المدير",
                    kingdom: "القيادة",
                    tools: { gem: {owned: 99}, upgrade: {owned: 99}, claw: {owned: 99}, wheel: {owned: 99} }
                });
            }
        }

        const user = await User.findOne({ username });
        
        if (!user) {
            return res.json({ success: false, message: "الحساب غير موجود" });
        }
        
        if (user.password !== password) {
            return res.json({ success: false, message: "كلمة المرور خطأ" });
        }
        
        res.json({
            success: true,
            isAdmin: user.isAdmin || false,
            userData: {
                highScore: user.highScore || 0,
                energy: user.energy ?? 200,
                grid: user.grid,
                stats: user.stats || {},
                displayName: user.displayName || "",
                kingdom: user.kingdom || "",
                alliance: user.alliance || "",
                tools: user.tools || {}
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "خطأ في السيرفر" });
    }
});

// حفظ اللعبة
app.post('/api/user/save', async (req, res) => {
    try {
        const { username, password, grid, energy, highScore, stats } = req.body;
        const user = await User.findOne({ username });
        
        if (user && user.password === password) {
            if (grid) user.grid = grid;
            if (energy !== undefined) user.energy = Math.max(0, Math.min(200, energy));
            if (highScore !== undefined) user.highScore = Math.max(user.highScore || 0, highScore);
            if (stats) user.stats = { ...user.stats, ...stats };
            await user.save();
            res.json({ success: true });
        } else {
            res.status(403).json({ success: false });
        }
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// تحديث الملف
app.post('/api/profile/update', async (req, res) => {
    try {
        const { username, password, displayName, kingdom, alliance, tools } = req.body;
        const user = await User.findOne({ username });
        
        if (user && user.password === password) {
            if (displayName !== undefined) user.displayName = String(displayName).substring(0, 30);
            if (kingdom !== undefined) user.kingdom = String(kingdom).substring(0, 50);
            if (alliance !== undefined) user.alliance = String(alliance).substring(0, 50);
            if (tools !== undefined) user.tools = tools;
            await user.save();
            res.json({ success: true, displayName: user.displayName });
        } else {
            res.status(403).json({ success: false });
        }
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// إضافة مستخدم
app.post('/api/users/add', async (req, res) => {
    try {
        const { adminUser, adminPass, newUsername, newPassword, isAdmin } = req.body;
        const admin = await User.findOne({ username: adminUser });
        
        if (!admin || !checkAdmin(admin, adminPass)) {
            return res.json({ success: false, message: "غير مصرح" });
        }
        
        if (await User.findOne({ username: newUsername })) {
            return res.json({ success: false, message: "الاسم موجود" });
        }
        
        await User.create({
            username: newUsername,
            password: newPassword,
            isAdmin: isAdmin || false
        });
        
        res.json({ success: true, message: `تم إنشاء ${newUsername}` });
    } catch (err) {
        res.json({ success: false, message: "خطأ" });
    }
});

// قائمة المستخدمين
app.post('/api/admin/users', async (req, res) => {
    try {
        const { adminUser, adminPass } = req.body;
        const admin = await User.findOne({ username: adminUser });
        
        if (!admin || !checkAdmin(admin, adminPass)) {
            return res.status(403).json({ success: false });
        }
        
        const users = await User.find({}, 'username isAdmin highScore stats kingdom alliance tools');
        res.json({ success: true, users });
    } catch (err) {
        res.json({ success: false });
    }
});

// المتصدرين
app.get('/api/leaderboard', async (req, res) => {
    try {
        const users = await User.find({})
            .sort({ highScore: -1 })
            .limit(10)
            .select('username highScore stats kingdom alliance displayName');
        
        res.json(users.map(u => ({
            username: u.username,
            displayName: u.displayName || u.username,
            score: u.highScore || 0,
            maxLvl: u.stats?.maxLvl || 0,
            kingdom: u.kingdom || "",
            alliance: u.alliance || ""
        })));
    } catch (err) {
        res.json([]);
    }
});

// تقييم
app.post('/api/reviews/add', async (req, res) => {
    try {
        const { username, rating, text } = req.body;
        await Review.create({ username, rating, text });
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false });
    }
});

// التقييمات (للأدمن)
app.post('/api/admin/reviews', async (req, res) => {
    try {
        const { adminUser, adminPass } = req.body;
        const admin = await User.findOne({ username: adminUser });
        
        if (!admin || !checkAdmin(admin, adminPass)) {
            return res.status(403).json({ success: false });
        }
        
        const reviews = await Review.find().sort({ date: -1 });
        res.json({ success: true, reviews });
    } catch (err) {
        res.json({ success: false });
    }
});

// إنجاز
app.post('/api/achievements/add', async (req, res) => {
    try {
        const { username, password, score, moves, rating, comment } = req.body;
        const user = await User.findOne({ username });
        
        if (!user || user.password !== password) {
            return res.status(403).json({ success: false });
        }
        
        await Achievement.create({ username, score, moves, rating, comment });
        
        user.stats.level11Merges = (user.stats.level11Merges || 0) + 1;
        await user.save();
        
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false });
    }
});

// الأرشيف (للأدمن)
app.post('/api/admin/achievements', async (req, res) => {
    try {
        const { adminUser, adminPass } = req.body;
        const admin = await User.findOne({ username: adminUser });
        
        if (!admin || !checkAdmin(admin, adminPass)) {
            return res.status(403).json({ success: false });
        }
        
        const achievements = await Achievement.find().sort({ date: -1 }).limit(50);
        res.json({ success: true, achievements });
    } catch (err) {
        res.json({ success: false });
    }
});

// رفع صورة
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

// ============================================
// Socket.io
// ============================================
io.on('connection', (socket) => {
    socket.on('user_joined', (data) => {
        socket.data = data;
    });
    
    socket.on('disconnect', () => {});
});

// ============================================
// تشغيل السيرفر
// ============================================
connectDB().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🦂 السيرفر شغال على ${PORT}`);
    });
});
