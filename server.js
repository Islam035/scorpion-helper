/**
 * ============================================
 * 🦂 مساعد عقروب V12 - السيرفر (MongoDB) - مُصحح
 * ============================================
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
// الإعدادات الأساسية
// ============================================
const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;

// Socket.io
const io = new Server(server, { 
    cors: { 
        origin: "*", 
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true
    },
    maxHttpBufferSize: 1e8
});

// ============================================
// Middleware
// ============================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Security Headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.removeHeader('X-Powered-By');
    next();
});

// ============================================
// رفع الصور
// ============================================
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const safeName = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname);
        cb(null, safeName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مسموح'), false);
        }
    }
});

// ============================================
// MongoDB Connection
// ============================================
const connectDB = async () => {
    try {
        if (!MONGODB_URI) {
            console.error('❌ MONGODB_URI غير موجود في متغيرات البيئة!');
            console.log('⚠️ السيرفر سيعمل بدون قاعدة بيانات');
            return false;
        }
        
        await mongoose.connect(MONGODB_URI);
        console.log('✅ متصل بقاعدة بيانات MongoDB');
        
        // تهيئة الإعدادات الافتراضية
        await initDefaultSettings();
        
        return true;
    } catch (error) {
        console.error('❌ خطأ في الاتصال بـ MongoDB:', error.message);
        return false;
    }
};

// ============================================
// MongoDB Schemas
// ============================================

// Schema المستخدمين
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    createdBy: { type: String, default: null },
    highScore: { type: Number, default: 0 },
    energy: { type: Number, default: 200 },
    stats: {
        moves: { type: Number, default: 0 },
        maxLvl: { type: Number, default: 0 }
    },
    grid: { type: Array, default: null },
    avatarUrl: { type: String, default: "" },
    kingdom: { type: String, default: "" },
    alliance: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
});

// Schema الإعدادات - تم تعديله لاستخدام Object بدلاً من Map
const settingsSchema = new mongoose.Schema({
    key: { type: String, default: 'main', unique: true },
    appName: { type: String, default: "مساعد عقروب V12" },
    logoUrl: { type: String, default: "" },
    geminiApiKey: { type: String, default: "" },
    termsTitle: { type: String, default: "ميثاق الشرف" },
    termsText: { type: String, default: "أهلاً بك يا بطل..." },
    colors: {
        bodyBg: { type: String, default: "#09090b" },
        panelBg: { type: String, default: "#18181b" },
        primary: { type: String, default: "#ea580c" },
        text: { type: String, default: "#f8fafc" }
    },
    animals: { type: Object, default: {} }
}, { minimize: false });

// Schema التقييمات
const reviewSchema = new mongoose.Schema({
    username: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, default: '' },
    date: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', userSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const Review = mongoose.model('Review', reviewSchema);

// ============================================
// بيانات الأدمن
// ============================================
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD || 'admin123';

// ============================================
// الإعدادات الافتراضية
// ============================================
function getDefaultAnimals() {
    const animals = {};
    animals['0'] = { icon: '', name: 'فارغ' };
    animals['1'] = { icon: '🐾', name: 'ذئب' };
    animals['2'] = { icon: '🦊', name: 'ثعلب' };
    animals['3'] = { icon: '🐺', name: 'ذئب رمادي' };
    animals['4'] = { icon: '🦁', name: 'أسد' };
    animals['5'] = { icon: '🐯', name: 'نمر' };
    animals['6'] = { icon: '🦅', name: 'نسر' };
    animals['7'] = { icon: '🐉', name: 'تنين' };
    animals['8'] = { icon: '🦖', name: 'ديناصور' };
    animals['9'] = { icon: '🔥', name: 'عنقاء' };
    animals['10'] = { icon: '⚡', name: 'برق' };
    animals['11'] = { icon: '👑', name: 'ملك' };
    return animals;
}

async function initDefaultSettings() {
    try {
        let settings = await Settings.findOne({ key: 'main' });
        if (!settings) {
            console.log('📝 إنشاء إعدادات افتراضية...');
            settings = await Settings.create({
                key: 'main',
                appName: "مساعد عقروب V12",
                logoUrl: "",
                geminiApiKey: "",
                termsTitle: "ميثاق الشرف",
                termsText: "أهلاً بك يا بطل...\n\n1. احترم اللاعبين الآخرين\n2. لا تشارك معلوماتك الحساسة\n3. استمتع وتعلم!",
                colors: { bodyBg: "#09090b", panelBg: "#18181b", primary: "#ea580c", text: "#f8fafc" },
                animals: getDefaultAnimals()
            });
            console.log('✅ تم إنشاء الإعدادات الافتراضية');
        } else {
            // تحديث animals إذا كانت فارغة
            if (!settings.animals || Object.keys(settings.animals).length === 0) {
                settings.animals = getDefaultAnimals();
                await settings.save();
                console.log('✅ تم تحديث الحيوانات الافتراضية');
            }
        }
    } catch (error) {
        console.error('خطأ في تهيئة الإعدادات:', error.message);
    }
}

// ============================================
// دوال التحقق
// ============================================
function checkAdmin(user, adminPass) {
    if (user.username === ADMIN_USER && adminPass === ADMIN_PASS) {
        return true;
    }
    if (user && user.isAdmin && user.password === adminPass) {
        return true;
    }
    return false;
}

function validateUsername(username) {
    if (!username || typeof username !== 'string') return false;
    if (username.length < 3 || username.length > 20) return false;
    if (!/^[a-zA-Z0-9_\u0600-\u06FF]+$/.test(username)) return false;
    return true;
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') return false;
    if (password.length < 4 || password.length > 50) return false;
    return true;
}

// ============================================
// API Routes - الإعدادات
// ============================================
app.get('/api/settings', async (req, res) => {
    try {
        let settings = await Settings.findOne({ key: 'main' });
        if (!settings) {
            settings = { 
                appName: "مساعد عقروب V12", 
                animals: getDefaultAnimals(),
                colors: { bodyBg: "#09090b", panelBg: "#18181b", primary: "#ea580c", text: "#f8fafc" },
                termsTitle: "ميثاق الشرف",
                termsText: "أهلاً بك..."
            };
        }
        
        const publicSettings = settings.toObject ? settings.toObject() : settings;
        delete publicSettings.geminiApiKey;
        delete publicSettings._id;
        delete publicSettings.__v;
        delete publicSettings.key;
        
        console.log('📤 إرسال الإعدادات:', JSON.stringify(publicSettings.animals));
        res.json(publicSettings);
    } catch (error) {
        console.error('خطأ في جلب الإعدادات:', error.message);
        res.json({ 
            appName: "مساعد عقروب", 
            animals: getDefaultAnimals(),
            colors: { bodyBg: "#09090b", panelBg: "#18181b", primary: "#ea580c", text: "#f8fafc" }
        });
    }
});

// ============================================
// API Routes - تسجيل الدخول
// ============================================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!validateUsername(username) || !validatePassword(password)) {
            return res.json({ 
                success: false, 
                message: "اسم المستخدم أو كلمة المرور غير صالحة!" 
            });
        }

        // التحقق من الأدمن الافتراضي
        if (username === ADMIN_USER && password === ADMIN_PASS) {
            let adminUser = await User.findOne({ username: ADMIN_USER });
            if (!adminUser) {
                adminUser = await User.create({
                    username: ADMIN_USER,
                    password: ADMIN_PASS,
                    isAdmin: true,
                    kingdom: "القيادة",
                    alliance: "المديرين"
                });
            }
        }

        const user = await User.findOne({ username });
        
        if (user) {
            if (user.password !== password) {
                return res.json({ 
                    success: false, 
                    message: "كلمة المرور غير صحيحة!" 
                });
            }
            
            return res.json({ 
                success: true, 
                isAdmin: user.isAdmin || false, 
                userData: { 
                    highScore: user.highScore || 0, 
                    energy: user.energy !== undefined ? user.energy : 200, 
                    grid: user.grid || null, 
                    stats: user.stats || { moves: 0, maxLvl: 0 },
                    avatarUrl: user.avatarUrl || "", 
                    kingdom: user.kingdom || "", 
                    alliance: user.alliance || ""
                }
            });
        }
        
        return res.json({ 
            success: false, 
            message: "الحساب غير موجود! تواصل مع القيادة." 
        });
    } catch (error) { 
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ 
            success: false, 
            message: "حدث خطأ في السيرفر" 
        }); 
    }
});

// ============================================
// API Routes - الملف الشخصي
// ============================================
app.post('/api/profile/update', async (req, res) => {
    try {
        const { username, password, avatarUrl, kingdom, alliance } = req.body;
        
        const user = await User.findOne({ username });
        
        if (user && user.password === password) {
            if (avatarUrl !== undefined) {
                if (avatarUrl === '' || avatarUrl.startsWith('/uploads/') || avatarUrl.startsWith('http')) {
                    user.avatarUrl = avatarUrl;
                }
            }
            if (kingdom !== undefined) {
                user.kingdom = String(kingdom).substring(0, 50);
            }
            if (alliance !== undefined) {
                user.alliance = String(alliance).substring(0, 50);
            }
            
            await user.save();
            
            io.emit('profile_updated', { 
                username, 
                avatarUrl: user.avatarUrl, 
                kingdom: user.kingdom, 
                alliance: user.alliance 
            });
            
            res.json({ success: true });
        } else { 
            res.status(403).json({ success: false, message: "غير مصرح" }); 
        }
    } catch (error) {
        console.error('خطأ في تحديث الملف:', error);
        res.status(500).json({ success: false, message: "حدث خطأ" });
    }
});

// ============================================
// API Routes - حفظ اللعبة
// ============================================
app.post('/api/user/save', async (req, res) => {
    try {
        const { username, password, grid, energy, highScore, stats } = req.body;
        
        const user = await User.findOne({ username });
        
        if (user && user.password === password) {
            if (grid && Array.isArray(grid)) {
                user.grid = grid;
            }
            
            if (typeof energy === 'number') {
                user.energy = Math.max(0, Math.min(200, energy));
            }
            
            if (typeof highScore === 'number') {
                user.highScore = Math.max(user.highScore || 0, highScore);
            }
            
            if (stats) {
                user.stats = stats;
            }
            
            await user.save();
            res.json({ success: true });
        } else {
            res.status(403).json({ success: false, message: "غير مصرح" });
        }
    } catch (error) {
        console.error('خطأ في الحفظ:', error);
        res.status(500).json({ success: false, message: "حدث خطأ" });
    }
});

// ============================================
// API Routes - رفع الصور
// ============================================
app.post('/api/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: "لم يتم استلام الصورة" 
            });
        }
        
        res.json({ 
            success: true, 
            url: `/uploads/${req.file.filename}` 
        });
    } catch (error) {
        console.error('خطأ في رفع الصورة:', error);
        res.status(500).json({ success: false, message: "حدث خطأ" });
    }
});

// ============================================
// API Routes - إدارة المستخدمين
// ============================================
app.post('/api/users/add', async (req, res) => {
    try {
        const { adminUser, adminPass, newUsername, newPassword, isAdmin: makeAdmin } = req.body;
        
        const admin = await User.findOne({ username: adminUser });
        if (!admin || !checkAdmin(admin, adminPass)) {
            return res.json({ 
                success: false, 
                message: "غير مصرح لك!" 
            });
        }
        
        if (!validateUsername(newUsername)) {
            return res.json({ 
                success: false, 
                message: "اسم المستخدم غير صالح! (3-20 حرف، أحرف وأرقام فقط)" 
            });
        }
        
        if (!validatePassword(newPassword)) {
            return res.json({ 
                success: false, 
                message: "كلمة المرور غير صالحة! (4-50 حرف)" 
            });
        }
        
        const existingUser = await User.findOne({ username: newUsername });
        if (existingUser) {
            return res.json({ 
                success: false, 
                message: "اسم المستخدم موجود مسبقاً!" 
            });
        }
        
        await User.create({
            username: newUsername,
            password: newPassword,
            isAdmin: makeAdmin || false,
            createdBy: adminUser,
            highScore: 0,
            energy: 200,
            stats: { moves: 0, maxLvl: 0 },
            grid: null,
            avatarUrl: "",
            kingdom: "",
            alliance: ""
        });
        
        res.json({ 
            success: true, 
            message: `تم إنشاء حساب ${newUsername} بنجاح.` 
        });
    } catch (error) { 
        console.error('خطأ في إضافة مستخدم:', error);
        res.json({ 
            success: false, 
            message: "حدث خطأ في السيرفر" 
        }); 
    }
});

// ============================================
// API Routes - تصفير النقاط
// ============================================
app.post('/api/admin/reset_score', async (req, res) => {
    try {
        const { adminUser, adminPass, targetUser } = req.body;
        
        const admin = await User.findOne({ username: adminUser });
        if (!admin || !checkAdmin(admin, adminPass)) {
            return res.json({ 
                success: false, 
                message: "غير مصرح لك!" 
            });
        }
        
        const user = await User.findOne({ username: targetUser });
        if (user) {
            user.highScore = 0;
            user.stats = { moves: 0, maxLvl: 0 };
            user.grid = null;
            await user.save();
            
            res.json({ 
                success: true, 
                message: `تم تصفير نقاط [ ${targetUser} ] بنجاح.` 
            });
        } else {
            res.json({ 
                success: false, 
                message: "المستخدم غير موجود بالخادم." 
            });
        }
    } catch (error) {
        console.error('خطأ في التصفير:', error);
        res.json({ 
            success: false, 
            message: "حدث خطأ في السيرفر." 
        });
    }
});

// ============================================
// API Routes - قائمة المستخدمين
// ============================================
app.post('/api/admin/users', async (req, res) => {
    try {
        const { adminUser, adminPass } = req.body;
        
        const admin = await User.findOne({ username: adminUser });
        if (!admin || !checkAdmin(admin, adminPass)) {
            return res.status(403).json({ success: false, message: "غير مصرح" });
        }
        
        const users = await User.find({}, 'username isAdmin createdBy kingdom alliance highScore');
        
        const usersList = users.map(u => ({
            username: u.username,
            isAdmin: u.isAdmin || false,
            createdBy: u.createdBy || 'المدير',
            kingdom: u.kingdom || '',
            alliance: u.alliance || '',
            score: u.highScore || 0
        }));
        
        res.json({ success: true, users: usersList });
    } catch (error) { 
        console.error('خطأ في جلب المستخدمين:', error);
        res.json({ success: false, message: "حدث خطأ" }); 
    }
});

// ============================================
// API Routes - حفظ الإعدادات
// ============================================
app.post('/api/settings', async (req, res) => {
    try {
        const { adminUser, adminPass, newSettings } = req.body;
        
        const admin = await User.findOne({ username: adminUser });
        if (!admin || !checkAdmin(admin, adminPass)) {
            return res.json({ 
                success: false, 
                message: "غير مصرح لك!" 
            });
        }
        
        let settings = await Settings.findOne({ key: 'main' });
        if (!settings) {
            settings = new Settings({ key: 'main' });
        }
        
        // تحديث الإعدادات
        if (newSettings.appName !== undefined) settings.appName = newSettings.appName;
        if (newSettings.logoUrl !== undefined) settings.logoUrl = newSettings.logoUrl;
        if (newSettings.geminiApiKey !== undefined) settings.geminiApiKey = newSettings.geminiApiKey;
        if (newSettings.termsTitle !== undefined) settings.termsTitle = newSettings.termsTitle;
        if (newSettings.termsText !== undefined) settings.termsText = newSettings.termsText;
        if (newSettings.colors !== undefined) settings.colors = newSettings.colors;
        if (newSettings.animals !== undefined) settings.animals = newSettings.animals;
        
        await settings.save();
        
        const publicSettings = settings.toObject();
        delete publicSettings.geminiApiKey;
        io.emit('settings_updated', publicSettings);
        
        res.json({ 
            success: true, 
            message: "تم نشر التحديثات بنجاح!" 
        });
    } catch (error) { 
        console.error('خطأ في حفظ الإعدادات:', error);
        res.json({ 
            success: false, 
            message: "حدث خطأ في السيرفر" 
        }); 
    }
});

// ============================================
// API Routes - التقييمات
// ============================================
app.post('/api/reviews/add', async (req, res) => {
    try {
        const { username, rating, text } = req.body;
        
        if (!username || typeof rating !== 'number' || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: "بيانات غير صالحة" });
        }
        
        await Review.create({
            username: String(username).substring(0, 50),
            rating: Math.min(5, Math.max(1, rating)),
            text: text ? String(text).substring(0, 500) : ''
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إضافة التقييم:', error);
        res.status(500).json({ success: false, message: "حدث خطأ" });
    }
});

app.post('/api/admin/reviews', async (req, res) => {
    try {
        const { adminUser, adminPass } = req.body;
        
        const admin = await User.findOne({ username: adminUser });
        if (!admin || !checkAdmin(admin, adminPass)) {
            return res.status(403).json({ success: false, message: "غير مصرح" });
        }
        
        const reviews = await Review.find().sort({ date: -1 });
        res.json({ 
            success: true, 
            reviews: reviews.map(r => ({
                username: r.username,
                rating: r.rating,
                text: r.text,
                date: r.date
            }))
        });
    } catch (error) {
        console.error('خطأ في جلب التقييمات:', error);
        res.status(500).json({ success: false, message: "حدث خطأ" });
    }
});

// ============================================
// API Routes - لوحة المتصدرين
// ============================================
app.get('/api/leaderboard', async (req, res) => {
    try {
        const users = await User.find({})
            .sort({ highScore: -1 })
            .limit(10)
            .select('username highScore stats kingdom alliance avatarUrl');
        
        const list = users.map(u => ({
            username: u.username,
            score: u.highScore || 0,
            maxLvl: u.stats?.maxLvl || 0,
            kingdom: u.kingdom || "",
            alliance: u.alliance || "",
            avatarUrl: u.avatarUrl || ""
        }));
        
        res.json(list);
    } catch (error) {
        console.error('خطأ في لوحة المتصدرين:', error);
        res.status(500).json([]);
    }
});

// ============================================
// API Route - AI Chat
// ============================================
app.post('/api/ai/chat', async (req, res) => {
    try {
        const { username, password, message } = req.body;
        
        const user = await User.findOne({ username });
        if (!user || user.password !== password) {
            return res.status(403).json({ success: false, message: "غير مصرح" });
        }
        
        const settings = await Settings.findOne({ key: 'main' });
        
        if (!settings || !settings.geminiApiKey) {
            return res.json({ 
                success: false, 
                message: "لم يتم تكوين مفتاح Gemini API" 
            });
        }
        
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${settings.geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: message }] }],
                    systemInstruction: {
                        parts: [{ 
                            text: `أنت مستشار ذكي في لعبة ${settings.appName}. أجب باختصار وبلغة المستخدم.` 
                        }]
                    }
                })
            }
        );
        
        const data = await response.json();
        
        if (data.candidates && data.candidates[0]) {
            res.json({ 
                success: true, 
                response: data.candidates[0].content.parts[0].text 
            });
        } else {
            res.json({ 
                success: false, 
                message: "لم يتم الحصول على رد من الذكاء الاصطناعي" 
            });
        }
    } catch (error) {
        console.error('خطأ في AI:', error);
        res.status(500).json({ 
            success: false, 
            message: "حدث خطأ في الاتصال بالذكاء الاصطناعي" 
        });
    }
});

// ============================================
// Socket.io
// ============================================
let onlineUsers = {};

io.on('connection', (socket) => {
    console.log('🔌 مستخدم متصل:', socket.id);
    
    socket.on('user_joined', (u) => { 
        if (!u || !u.username) return;
        
        onlineUsers[socket.id] = { 
            username: u.username, 
            kingdom: u.kingdom || '', 
            alliance: u.alliance || '', 
            avatarUrl: u.avatarUrl || '' 
        }; 
        
        io.emit('update_online_users', Object.values(onlineUsers));
    });
    
    socket.on('global_msg', (data) => {
        if (!data || !data.sender || !data.text) return;
        
        const cleanText = String(data.text).substring(0, 500);
        
        io.emit('global_msg', { 
            sender: data.sender, 
            text: cleanText, 
            kingdom: data.kingdom || '', 
            alliance: data.alliance || '', 
            avatarUrl: data.avatarUrl || '' 
        }); 
    });
    
    socket.on('disconnect', () => { 
        console.log('🔌 مستخدم مفصول:', socket.id);
        delete onlineUsers[socket.id]; 
        io.emit('update_online_users', Object.values(onlineUsers)); 
    });
});

// ============================================
// معالجة الأخطاء
// ============================================
app.use((err, req, res, next) => {
    console.error('خطأ غير معالج:', err);
    res.status(500).json({ 
        success: false, 
        message: "حدث خطأ في السيرفر" 
    });
});

// ============================================
// تشغيل السيرفر
// ============================================
const startServer = async () => {
    await connectDB();
    
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🦂 السيرفر شغال على المنفذ ${PORT}`);
        console.log(`📍 الرابط: http://localhost:${PORT}`);
    });
};

startServer();