/**
 * ============================================
 * 🦂 مساعد عقروب V13 - السيرفر الكامل
 * ============================================
 * الميزات الجديدة:
 * - شاشة البداية مع لوجو قابل للتخصيص
 * - عداد الوقت المتبقي للحدث
 * - نظام الأرشيف للإنجازات
 * - نظام الأدوات الذكي
 * - خوارزمية Expectimax محسنة
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
        maxLvl: { type: Number, default: 0 },
        totalMerges: { type: Number, default: 0 },
        level11Merges: { type: Number, default: 0 }
    },
    grid: { type: Array, default: null },
    avatarUrl: { type: String, default: "" },
    kingdom: { type: String, default: "" },
    alliance: { type: String, default: "" },
    // نظام الأدوات
    tools: {
        gem: { owned: { type: Number, default: 0 }, limit: { type: Number, default: 0 } },
        upgradeGem: { owned: { type: Number, default: 0 }, limit: { type: Number, default: 0 } },
        claw: { owned: { type: Number, default: 0 }, limit: { type: Number, default: 0 } },
        wheel: { owned: { type: Number, default: 0 }, limit: { type: Number, default: 0 } }
    },
    createdAt: { type: Date, default: Date.now }
});

// Schema الإعدادات
const settingsSchema = new mongoose.Schema({
    key: { type: String, default: 'main', unique: true },
    appName: { type: String, default: "مساعد عقروب V13" },
    logoUrl: { type: String, default: "" },
    splashLogoUrl: { type: String, default: "" },
    geminiApiKey: { type: String, default: "" },
    termsTitle: { type: String, default: "ميثاق الشرف" },
    termsText: { type: String, default: "أهلاً بك يا بطل..." },
    colors: {
        bodyBg: { type: String, default: "#09090b" },
        panelBg: { type: String, default: "#18181b" },
        primary: { type: String, default: "#ea580c" },
        text: { type: String, default: "#f8fafc" }
    },
    animals: { type: Object, default: {} },
    // إعدادات الحدث
    eventConfig: {
        endDate: { type: Date, default: null },
        dailyResetHour: { type: Number, default: 2 }, // 2:00 AM Egypt time
        maxEnergy: { type: Number, default: 200 },
        energyRegenSeconds: { type: Number, default: 72 }
    }
}, { minimize: false });

// Schema التقييمات
const reviewSchema = new mongoose.Schema({
    username: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, default: '' },
    date: { type: Date, default: Date.now }
});

// Schema الأرشيف (إنجازات دمج مستوى 11)
const achievementSchema = new mongoose.Schema({
    username: { type: String, required: true },
    level: { type: Number, default: 11 },
    gridSnapshot: { type: Array, default: [] },
    score: { type: Number, default: 0 },
    moves: { type: Number, default: 0 },
    date: { type: Date, default: Date.now },
    celebrationShown: { type: Boolean, default: false },
    rating: { type: Number, default: 0 },
    comment: { type: String, default: '' }
});

// Models
const User = mongoose.model('User', userSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const Review = mongoose.model('Review', reviewSchema);
const Achievement = mongoose.model('Achievement', achievementSchema);

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
    animals['1'] = { icon: '🐭', name: 'فأر' };
    animals['2'] = { icon: '🐰', name: 'أرنب' };
    animals['3'] = { icon: '🦊', name: 'ثعلب' };
    animals['4'] = { icon: '🐺', name: 'ذئب' };
    animals['5'] = { icon: '🦁', name: 'أسد' };
    animals['6'] = { icon: '🐯', name: 'نمر' };
    animals['7'] = { icon: '🦅', name: 'نسر' };
    animals['8'] = { icon: '🐉', name: 'تنين' };
    animals['9'] = { icon: '🔥', name: 'عنقاء' };
    animals['10'] = { icon: '⚡', name: 'برق' };
    animals['11'] = { icon: '👑', name: 'الملك' };
    return animals;
}

function getDefaultTerms() {
    return {
        title: "ميثاق شرف مساعد عقروب",
        text: `🦂 مرحباً بك في مساعد عقروب V13 🦂

═══════════════════════════════════

📌 **تعريف بالبرنامج**

مساعد عقروب هو برنامج مساعد متخصص للعبة "بهجة الحيوانات" (Battle Animal Merge Joy) - لعبة دمج الحيوانات الاستراتيجية الشهيرة.

═══════════════════════════════════

🎯 **الهدف من البرنامج**

يهدف البرنامج لمساعدتك في:
• تحقيق أعلى النقاط الممكنة
• الوصول للمستوى 11 (الملك) ودمجه 3 مرات
• استخدام طاقتك بكفاءة عالية
• التخطيط الاستراتيجي لكل حركة

═══════════════════════════════════

⭐ **الهدف من اللعبة**

الهدف الرئيسي هو دمج حيوانين متشابهين للحصول على حيوان أعلى مستوى. المستوى الأقصى هو 11 (الملك).

• كل دمج = نقاط = 2^ن (ن = المستوى الجديد)
• الهدف النهائي: دمج المستوى 11 ثلاث مرات في الجولة الواحدة

═══════════════════════════════════

⚡ **نظام الطاقة**

• الحد الأقصى: 200 وحدة طاقة
• كل حركة تستهلك: 1 وحدة
• التجديد: 1 وحدة كل 72 ثانية
• إعادة التعبئة الكاملة: الساعة 2:00 صباحاً بتوقيت مصر

═══════════════════════════════════

🛠️ **الأدوات المتاحة**

💎 الجوهرة: لإضافة أي حيوان تريده
⬆️ جوهرة الترقية: لرفع مستوى حيوان موجود
🦅 المخلب: لحذف حيوان من الشبكة
🎡 العجلة: لتبديل موقع حيوانين

ملاحظة: يجب أن تمتلك الأداة AND يكون لديك حد استخدام متاح

═══════════════════════════════════

📜 **شروط وأحكام الاستخدام**

1️⃣ يجب استخدام البرنامج للأغراض الترفيهية فقط
2️⃣ يُحظر مشاركة بيانات حسابك مع الآخرين
3️⃣ يجب احترام اللاعبين الآخرين في الشات العام
4️⃣ يُحظر استخدام أي وسائل غش أو استغلال ثغرات
5️⃣ الحسابات المخالفة ستُحذف نهائياً
6️⃣ الإدارة غير مسؤولة عن فقدان البيانات

═══════════════════════════════════

🔒 **الخصوصية والأمان**

• بياناتك محمية ومشفرة
• لن نشارك معلوماتك مع أطراف ثالثة
• يمكنك طلب حذف حسابك في أي وقت

═══════════════════════════════════

📞 **للتواصل والدعم**

للاستفسارات والمشاكل، تواصل مع القيادة أو الإدارة.

═══════════════════════════════════

✅ بالمتابعة، أنت توافق على هذه الشروط والأحكام.

🦂 بالتوفيق يا بطل! 🦂`
    };
}

async function initDefaultSettings() {
    try {
        let settings = await Settings.findOne({ key: 'main' });
        if (!settings) {
            console.log('📝 إنشاء إعدادات افتراضية...');
            
            // تاريخ نهاية الحدث: بعد يوم و21 ساعة و28 دقيقة و10 ثواني من الآن
            const eventEndDate = new Date();
            eventEndDate.setDate(eventEndDate.getDate() + 1);
            eventEndDate.setHours(eventEndDate.getHours() + 21);
            eventEndDate.setMinutes(eventEndDate.getMinutes() + 28);
            eventEndDate.setSeconds(eventEndDate.getSeconds() + 10);
            
            const defaultTerms = getDefaultTerms();
            
            settings = await Settings.create({
                key: 'main',
                appName: "مساعد عقروب V13",
                logoUrl: "",
                splashLogoUrl: "",
                geminiApiKey: "",
                termsTitle: defaultTerms.title,
                termsText: defaultTerms.text,
                colors: { bodyBg: "#0a0a0a", panelBg: "#141414", primary: "#D4AF37", text: "#F5F5DC" },
                animals: getDefaultAnimals(),
                eventConfig: {
                    endDate: eventEndDate,
                    dailyResetHour: 2,
                    maxEnergy: 200,
                    energyRegenSeconds: 72
                }
            });
            console.log('✅ تم إنشاء الإعدادات الافتراضية');
        } else {
            // تحديث animals إذا كانت فارغة
            if (!settings.animals || Object.keys(settings.animals).length === 0) {
                settings.animals = getDefaultAnimals();
                await settings.save();
                console.log('✅ تم تحديث الحيوانات الافتراضية');
            }
            // تحديث الشروط إذا كانت فارغة
            if (!settings.termsText || settings.termsText.length < 100) {
                const defaultTerms = getDefaultTerms();
                settings.termsTitle = defaultTerms.title;
                settings.termsText = defaultTerms.text;
                await settings.save();
                console.log('✅ تم تحديث الشروط الافتراضية');
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
                appName: "مساعد عقروب V13", 
                animals: getDefaultAnimals(),
                colors: { bodyBg: "#09090b", panelBg: "#18181b", primary: "#ea580c", text: "#f8fafc" },
                termsTitle: "ميثاق الشرف",
                termsText: "أهلاً بك...",
                splashLogoUrl: "",
                eventConfig: {
                    endDate: null,
                    dailyResetHour: 2,
                    maxEnergy: 200,
                    energyRegenSeconds: 72
                }
            };
        }
        
        const publicSettings = settings.toObject ? settings.toObject() : settings;
        delete publicSettings.geminiApiKey;
        delete publicSettings._id;
        delete publicSettings.__v;
        delete publicSettings.key;
        
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
// API Routes - الوقت المتبقي للحدث
// ============================================
app.get('/api/event/timeleft', async (req, res) => {
    try {
        const settings = await Settings.findOne({ key: 'main' });
        const endDate = settings?.eventConfig?.endDate;
        
        if (!endDate) {
            return res.json({ 
                success: false, 
                message: "لم يتم تحديد تاريخ نهاية الحدث",
                timeLeft: null
            });
        }
        
        const now = new Date();
        const end = new Date(endDate);
        const diff = end - now;
        
        if (diff <= 0) {
            return res.json({ 
                success: false, 
                message: "انتهى الحدث!",
                timeLeft: { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 }
            });
        }
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        res.json({ 
            success: true, 
            timeLeft: { days, hours, minutes, seconds, total: diff },
            endDate: end.toISOString(),
            now: now.toISOString()
        });
    } catch (error) {
        console.error('خطأ في حساب الوقت:', error);
        res.status(500).json({ success: false, message: "حدث خطأ" });
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
                    alliance: "المديرين",
                    tools: {
                        gem: { owned: 999, limit: 999 },
                        upgradeGem: { owned: 99, limit: 99 },
                        claw: { owned: 99, limit: 99 },
                        wheel: { owned: 99, limit: 99 }
                    }
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
                    stats: user.stats || { moves: 0, maxLvl: 0, totalMerges: 0, level11Merges: 0 },
                    avatarUrl: user.avatarUrl || "", 
                    kingdom: user.kingdom || "", 
                    alliance: user.alliance || "",
                    tools: user.tools || {
                        gem: { owned: 0, limit: 0 },
                        upgradeGem: { owned: 0, limit: 0 },
                        claw: { owned: 0, limit: 0 },
                        wheel: { owned: 0, limit: 0 }
                    }
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
        const { username, password, avatarUrl, kingdom, alliance, tools } = req.body;
        
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
            if (tools !== undefined) {
                user.tools = tools;
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
                user.stats = { ...user.stats, ...stats };
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
        const { adminUser, adminPass, newUsername, newPassword, isAdmin: makeAdmin, tools } = req.body;
        
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
        
        const defaultTools = tools || {
            gem: { owned: 0, limit: 0 },
            upgradeGem: { owned: 0, limit: 0 },
            claw: { owned: 0, limit: 0 },
            wheel: { owned: 0, limit: 0 }
        };
        
        await User.create({
            username: newUsername,
            password: newPassword,
            isAdmin: makeAdmin || false,
            createdBy: adminUser,
            highScore: 0,
            energy: 200,
            stats: { moves: 0, maxLvl: 0, totalMerges: 0, level11Merges: 0 },
            grid: null,
            avatarUrl: "",
            kingdom: "",
            alliance: "",
            tools: defaultTools
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
            user.stats = { moves: 0, maxLvl: 0, totalMerges: 0, level11Merges: 0 };
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
        
        const users = await User.find({}, 'username isAdmin createdBy kingdom alliance highScore stats tools');
        
        const usersList = users.map(u => ({
            username: u.username,
            isAdmin: u.isAdmin || false,
            createdBy: u.createdBy || 'المدير',
            kingdom: u.kingdom || '',
            alliance: u.alliance || '',
            score: u.highScore || 0,
            stats: u.stats || {},
            tools: u.tools || {}
        }));
        
        res.json({ success: true, users: usersList });
    } catch (error) { 
        console.error('خطأ في جلب المستخدمين:', error);
        res.json({ success: false, message: "حدث خطأ" }); 
    }
});

// ============================================
// API Routes - تحديث مستخدم
// ============================================
app.post('/api/admin/update_user', async (req, res) => {
    try {
        const { adminUser, adminPass, targetUser, updates } = req.body;
        
        const admin = await User.findOne({ username: adminUser });
        if (!admin || !checkAdmin(admin, adminPass)) {
            return res.json({ success: false, message: "غير مصرح" });
        }
        
        const user = await User.findOne({ username: targetUser });
        if (!user) {
            return res.json({ success: false, message: "المستخدم غير موجود" });
        }
        
        // تحديث البيانات المسموحة
        if (updates.highScore !== undefined) user.highScore = updates.highScore;
        if (updates.energy !== undefined) user.energy = updates.energy;
        if (updates.kingdom !== undefined) user.kingdom = updates.kingdom;
        if (updates.alliance !== undefined) user.alliance = updates.alliance;
        if (updates.stats !== undefined) user.stats = { ...user.stats, ...updates.stats };
        if (updates.tools !== undefined) user.tools = { ...user.tools, ...updates.tools };
        
        await user.save();
        
        res.json({ success: true, message: "تم تحديث البيانات بنجاح" });
    } catch (error) {
        console.error('خطأ في تحديث المستخدم:', error);
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
        if (newSettings.splashLogoUrl !== undefined) settings.splashLogoUrl = newSettings.splashLogoUrl;
        if (newSettings.geminiApiKey !== undefined) settings.geminiApiKey = newSettings.geminiApiKey;
        if (newSettings.termsTitle !== undefined) settings.termsTitle = newSettings.termsTitle;
        if (newSettings.termsText !== undefined) settings.termsText = newSettings.termsText;
        if (newSettings.colors !== undefined) settings.colors = newSettings.colors;
        if (newSettings.animals !== undefined) settings.animals = newSettings.animals;
        if (newSettings.eventConfig !== undefined) {
            settings.eventConfig = { ...settings.eventConfig, ...newSettings.eventConfig };
        }
        
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
// API Routes - الأرشيف (إنجازات دمج 11)
// ============================================
app.post('/api/achievements/add', async (req, res) => {
    try {
        const { username, password, gridSnapshot, score, moves, rating, comment } = req.body;
        
        const user = await User.findOne({ username });
        if (!user || user.password !== password) {
            return res.status(403).json({ success: false, message: "غير مصرح" });
        }
        
        const achievement = await Achievement.create({
            username: username,
            level: 11,
            gridSnapshot: gridSnapshot || [],
            score: score || 0,
            moves: moves || 0,
            rating: rating || 0,
            comment: comment || ''
        });
        
        // تحديث إحصائيات اللاعب
        user.stats.level11Merges = (user.stats.level11Merges || 0) + 1;
        await user.save();
        
        // بث للجميع
        io.emit('new_achievement', {
            username: username,
            level: 11,
            score: score,
            date: achievement.date
        });
        
        res.json({ success: true, achievement });
    } catch (error) {
        console.error('خطأ في إضافة الإنجاز:', error);
        res.status(500).json({ success: false, message: "حدث خطأ" });
    }
});

app.post('/api/admin/achievements', async (req, res) => {
    try {
        const { adminUser, adminPass, limit = 50 } = req.body;
        
        const admin = await User.findOne({ username: adminUser });
        if (!admin || !checkAdmin(admin, adminPass)) {
            return res.status(403).json({ success: false, message: "غير مصرح" });
        }
        
        const achievements = await Achievement.find()
            .sort({ date: -1 })
            .limit(limit);
        
        res.json({ 
            success: true, 
            achievements: achievements.map(a => ({
                id: a._id,
                username: a.username,
                level: a.level,
                gridSnapshot: a.gridSnapshot,
                score: a.score,
                moves: a.moves,
                date: a.date,
                rating: a.rating,
                comment: a.comment
            }))
        });
    } catch (error) {
        console.error('خطأ في جلب الأرشيف:', error);
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
// API Route - حساب أفضل حركة (Expectimax)
// ============================================
app.post('/api/calculate_move', async (req, res) => {
    try {
        const { grid, depth = 3 } = req.body;
        
        if (!grid || !Array.isArray(grid)) {
            return res.status(400).json({ success: false, message: "بيانات الشبكة غير صالحة" });
        }
        
        // تشغيل الخوارزمية
        const result = calculateBestMove(grid, depth);
        
        res.json({ 
            success: true, 
            move: result.move,
            score: result.score,
            stats: result.stats
        });
    } catch (error) {
        console.error('خطأ في حساب الحركة:', error);
        res.status(500).json({ success: false, message: "حدث خطأ" });
    }
});

// ============================================
// Expectimax Algorithm (معدل للقيم 1-7)
// ============================================

function calculateBestMove(grid, depth) {
    const result = expectimax(grid, depth, true);
    
    // حساب إحصائيات إضافية
    let stats = {
        emptyCells: 0,
        maxLevel: 0,
        totalValue: 0
    };
    
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            if (grid[r][c] === 0) stats.emptyCells++;
            else {
                stats.totalValue += Math.pow(2, grid[r][c]);
                if (grid[r][c] > stats.maxLevel) stats.maxLevel = grid[r][c];
            }
        }
    }
    
    return {
        move: result.move,
        score: result.score,
        stats: stats
    };
}

function expectimax(g, depth, isMax) {
    if (depth === 0) return { score: evaluate(g), move: null };
    
    if (isMax) {
        let best = { score: -Infinity, move: null };
        for (let dir of ['UP', 'DOWN', 'LEFT', 'RIGHT']) {
            const res = moveGrid(dir, g);
            if (res.moved) {
                const child = expectimax(res.grid, depth - 1, false);
                if (child.score > best.score) best = { score: child.score, move: dir };
            }
        }
        return best.score === -Infinity ? { score: evaluate(g), move: 'UP' } : best;
    } else {
        // عقدة الصدفة - معدلة للقيم 1-7 بدلاً من 1-2 فقط
        let empty = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (g[r][c] === 0) empty.push({ r, c });
            }
        }
        
        if (empty.length === 0) return { score: evaluate(g), move: null };
        
        let total = 0;
        // أخذ عينة عشوائية للسرعة
        const sampleSize = Math.min(empty.length, 6);
        const sample = empty.slice(0, sampleSize);
        
        for (let pos of sample) {
            // في اللعبة، القيم تظهر من 1-7 بتوزيع غير متساوٍ
            // القيم المنخفضة أكثر شيوعاً
            const values = [1, 1, 1, 2, 2, 3, 4, 5, 6, 7]; // توزيع تقريبي
            for (let v of values.slice(0, 4)) { // أخذ 4 قيم فقط للسرعة
                let ng = JSON.parse(JSON.stringify(g));
                ng[pos.r][pos.c] = v;
                total += expectimax(ng, depth - 1, true).score;
            }
        }
        
        return { score: total / (sampleSize * 4), move: null };
    }
}

function moveGrid(dir, g) {
    let moved = false;
    let newG = JSON.parse(JSON.stringify(g));
    
    const merge = (row) => {
        let newRow = row.filter(v => v !== 0);
        for (let i = 0; i < newRow.length - 1; i++) {
            if (newRow[i] === newRow[i + 1]) {
                newRow[i]++;
                newRow.splice(i + 1, 1);
            }
        }
        while (newRow.length < 4) newRow.push(0);
        return newRow;
    };
    
    if (dir === 'RIGHT') {
        for (let r = 0; r < 4; r++) {
            let rev = [...newG[r]].reverse();
            let merged = merge(rev).reverse();
            if (JSON.stringify(newG[r]) !== JSON.stringify(merged)) moved = true;
            newG[r] = merged;
        }
    } else if (dir === 'LEFT') {
        for (let r = 0; r < 4; r++) {
            let merged = merge(newG[r]);
            if (JSON.stringify(newG[r]) !== JSON.stringify(merged)) moved = true;
            newG[r] = merged;
        }
    } else if (dir === 'UP') {
        for (let c = 0; c < 4; c++) {
            let col = [newG[0][c], newG[1][c], newG[2][c], newG[3][c]];
            let merged = merge(col);
            if (JSON.stringify(col) !== JSON.stringify(merged)) moved = true;
            for (let r = 0; r < 4; r++) newG[r][c] = merged[r];
        }
    } else if (dir === 'DOWN') {
        for (let c = 0; c < 4; c++) {
            let col = [newG[3][c], newG[2][c], newG[1][c], newG[0][c]];
            let merged = merge(col);
            if (JSON.stringify([newG[0][c], newG[1][c], newG[2][c], newG[3][c]]) !== JSON.stringify(merged.reverse())) moved = true;
            for (let r = 0; r < 4; r++) newG[r][c] = merged[r];
        }
    }
    
    return { moved, grid: newG };
}

function evaluate(g) {
    let score = 0;
    let empty = 0;
    let maxV = 0;
    
    // مصفوفة الأوزان - إعطاء أولوية للزوايا
    const weights = [
        [16, 8, 4, 2],
        [8, 4, 2, 1],
        [4, 2, 1, 0.5],
        [2, 1, 0.5, 0.25]
    ];
    
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            if (g[r][c] === 0) {
                empty++;
            } else {
                // قيمة الخلية تعتمد على مستواها وموقعها
                score += Math.pow(2, g[r][c]) * weights[r][c];
                if (g[r][c] > maxV) maxV = g[r][c];
            }
        }
    }
    
    // مكافأة للخلايا الفارغة
    score += empty * 100;
    
    // مكافأة للمستوى الأعلى
    score += Math.pow(2, maxV) * 2;
    
    // مكافأة للتجميع (خلايا متجاورة من نفس المستوى)
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 3; c++) {
            if (g[r][c] === g[r][c + 1] && g[r][c] !== 0) {
                score += Math.pow(2, g[r][c]) * 10;
            }
        }
    }
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 3; r++) {
            if (g[r][c] === g[r + 1][c] && g[r][c] !== 0) {
                score += Math.pow(2, g[r][c]) * 10;
            }
        }
    }
    
    // مكافأة خاصة للمستوى 11
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            if (g[r][c] === 11) {
                score += 100000; // مكافأة ضخمة للوصول للمستوى 11
            }
        }
    }
    
    return score;
}

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
