/**
 * ============================================
 * 🦂 مساعد عقروب V12 - السيرفر المحسّن
 * ============================================
 * تحسينات أمنية وأداء
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

// ============================================
// الإعدادات والمتغيرات البيئية
// ============================================
const app = express();
const server = http.createServer(app);

// Socket.io مع إعدادات محسّنة
const io = new Server(server, { 
    cors: { 
        origin: "*", 
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true
    },
    maxHttpBufferSize: 1e8 // 100MB
});

// ============================================
// Middleware الأساسي
// ============================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// إضافة Security Headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.removeHeader('X-Powered-By');
    next();
});

// ============================================
// إدارة الملفات والرفع
// ============================================
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        // اسم ملف آمن
        const safeName = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname);
        cb(null, safeName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
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
// قاعدة البيانات (JSON Files)
// ============================================
const DB_FILE = './users_db.json';
const SETTINGS_FILE = './settings_db.json';
const REVIEWS_FILE = './reviews_db.json';

// دالة قراءة آمنة
function safeReadFile(filePath, defaultValue) {
    try {
        if (!fs.existsSync(filePath)) return defaultValue;
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error(`خطأ في قراءة ${filePath}:`, e.message);
        return defaultValue;
    }
}

// دالة كتابة آمنة
function safeWriteFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        console.error(`خطأ في كتابة ${filePath}:`, e.message);
        return false;
    }
}

// ============================================
// إدارة المستخدمين
// ============================================
function getDB() {
    return safeReadFile(DB_FILE, { users: {} });
}

function saveDB(data) {
    return safeWriteFile(DB_FILE, data);
}

function getReviews() {
    return safeReadFile(REVIEWS_FILE, { reviews: [] });
}

function saveReviews(data) {
    return safeWriteFile(REVIEWS_FILE, data);
}

// ============================================
// الإعدادات الافتراضية
// ============================================
const defaultSettings = {
    appName: "مساعد عقروب V12",
    logoUrl: "",
    geminiApiKey: "",
    termsTitle: "ميثاق الشرف",
    termsText: "أهلاً بك يا بطل...\n\n1. احترم اللاعبين الآخرين\n2. لا تشارك معلوماتك الحساسة\n3. استمتع وتعلم!",
    colors: { 
        bodyBg: "#09090b", 
        panelBg: "#18181b", 
        primary: "#ea580c", 
        text: "#f8fafc" 
    },
    animals: { 0: { icon: '', name: 'فارغ' } }
};

// إنشاء الحيوانات الافتراضية
for (let i = 1; i <= 11; i++) {
    defaultSettings.animals[i] = { icon: '🐾', name: `مستوى ${i}` };
}

function getSettings() {
    return safeReadFile(SETTINGS_FILE, defaultSettings);
}

function saveSettings(data) {
    return safeWriteFile(SETTINGS_FILE, data);
}

// تهيئة الملفات
getDB(); 
getSettings(); 
getReviews();

// ============================================
// بيانات الأدمن الافتراضي (من متغيرات البيئة)
// ============================================
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// ============================================
// دوال التحقق
// ============================================

// التحقق من صلاحيات الأدمن
function checkAdmin(db, adminUser, adminPass) {
    // التحقق من الأدمن الافتراضي
    if (adminUser === ADMIN_USER && adminPass === ADMIN_PASS) {
        return true;
    }
    
    // التحقق من الأدمن من قاعدة البيانات
    const user = db.users[adminUser];
    if (user && user.isAdmin) {
        if (user.password === adminPass) return true;
    }
    
    return false;
}

// التحقق من صحة اسم المستخدم
function validateUsername(username) {
    if (!username || typeof username !== 'string') return false;
    if (username.length < 3 || username.length > 20) return false;
    if (!/^[a-zA-Z0-9_\u0600-\u06FF]+$/.test(username)) return false;
    return true;
}

// التحقق من صحة كلمة المرور
function validatePassword(password) {
    if (!password || typeof password !== 'string') return false;
    if (password.length < 4 || password.length > 50) return false;
    return true;
}

// ============================================
// API Routes - تسجيل الدخول
// ============================================
app.post('/api/login', (req, res) => {
    try {
        const { username, password, deviceId } = req.body;
        
        // التحقق من المدخلات
        if (!validateUsername(username) || !validatePassword(password)) {
            return res.json({ 
                success: false, 
                message: "اسم المستخدم أو كلمة المرور غير صالحة!" 
            });
        }

        const db = getDB();
        
        // إنشاء حساب الأدمن الافتراضي إذا لم يكن موجوداً
        if (username === ADMIN_USER && password === ADMIN_PASS) {
            if (!db.users[ADMIN_USER]) {
                db.users[ADMIN_USER] = { 
                    password: ADMIN_PASS,
                    deviceId: deviceId, 
                    isAdmin: true, 
                    highScore: 0, 
                    energy: 200, 
                    stats: { moves: 0, maxLvl: 0 }, 
                    grid: null,
                    avatarUrl: "", 
                    kingdom: "القيادة", 
                    alliance: "المديرين" 
                };
                saveDB(db);
            }
        }

        const user = db.users[username];
        if (user) {
            // التحقق من كلمة المرور
            if (user.password !== password) {
                return res.json({ 
                    success: false, 
                    message: "كلمة المرور غير صحيحة!" 
                });
            }
            
            // التحقق من ربط الجهاز
           git add server.js
git commit -m "إزالة نظام ربط الجهاز"
git push origin main
            
            // إرجاع بيانات المستخدم
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
// API Routes - تحديث الملف الشخصي
// ============================================
app.post('/api/profile/update', (req, res) => {
    try {
        const { username, password, avatarUrl, kingdom, alliance } = req.body;
        const db = getDB();
        
        if (db.users[username] && db.users[username].password === password) {
            if (avatarUrl !== undefined) {
                if (avatarUrl === '' || avatarUrl.startsWith('/uploads/') || avatarUrl.startsWith('http')) {
                    db.users[username].avatarUrl = avatarUrl;
                }
            }
            if (kingdom !== undefined) {
                db.users[username].kingdom = String(kingdom).substring(0, 50);
            }
            if (alliance !== undefined) {
                db.users[username].alliance = String(alliance).substring(0, 50);
            }
            
            saveDB(db);
            
            io.emit('profile_updated', { 
                username, 
                avatarUrl: db.users[username].avatarUrl, 
                kingdom: db.users[username].kingdom, 
                alliance: db.users[username].alliance 
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
// API Routes - حفظ بيانات اللعبة
// ============================================
app.post('/api/user/save', (req, res) => {
    try {
        const { username, password, grid, energy, highScore, stats } = req.body;
        const db = getDB();
        
        if (db.users[username] && db.users[username].password === password) {
            if (grid && Array.isArray(grid)) {
                db.users[username].grid = grid;
            }
            
            if (typeof energy === 'number') {
                db.users[username].energy = Math.max(0, Math.min(200, energy));
            }
            
            if (typeof highScore === 'number') {
                db.users[username].highScore = Math.max(
                    db.users[username].highScore || 0, 
                    highScore
                );
            }
            
            if (stats) {
                db.users[username].stats = stats;
            }
            
            saveDB(db);
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
// API Routes - إدارة المستخدمين (Admin)
// ============================================
app.post('/api/users/add', (req, res) => {
    try {
        const { adminUser, adminPass, newUsername, newPassword, isAdmin } = req.body;
        const db = getDB();
        
        if (!checkAdmin(db, adminUser, adminPass)) {
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
        
        if (db.users[newUsername]) {
            return res.json({ 
                success: false, 
                message: "اسم المستخدم موجود مسبقاً!" 
            });
        }
        
        db.users[newUsername] = { 
            password: newPassword,
            deviceId: null, 
            isAdmin: isAdmin || false, 
            createdBy: adminUser,
            highScore: 0, 
            energy: 200, 
            stats: { moves: 0, maxLvl: 0 }, 
            grid: null,
            avatarUrl: "", 
            kingdom: "", 
            alliance: ""
        };
        
        saveDB(db);
        
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
// API Routes - تصفير نقاط اللاعب
// ============================================
app.post('/api/admin/reset_score', (req, res) => {
    try {
        const { adminUser, adminPass, targetUser } = req.body;
        const db = getDB();
        
        if (!checkAdmin(db, adminUser, adminPass)) {
            return res.json({ 
                success: false, 
                message: "غير مصرح لك!" 
            });
        }
        
        if (db.users[targetUser]) {
            db.users[targetUser].highScore = 0;
            if (db.users[targetUser].stats) {
                db.users[targetUser].stats.maxLvl = 0;
            }
            db.users[targetUser].grid = null;
            saveDB(db);
            
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
app.post('/api/admin/users', (req, res) => {
    try {
        const { adminUser, adminPass } = req.body;
        const db = getDB();
        
        if (!checkAdmin(db, adminUser, adminPass)) {
            return res.status(403).json({ success: false, message: "غير مصرح" });
        }
        
        const usersList = Object.keys(db.users).map(k => ({
            username: k, 
            isAdmin: db.users[k].isAdmin || false, 
            createdBy: db.users[k].createdBy || 'المدير',
            kingdom: db.users[k].kingdom || '', 
            alliance: db.users[k].alliance || '', 
            score: db.users[k].highScore || 0
        }));
        
        res.json({ success: true, users: usersList });
    } catch (error) { 
        console.error('خطأ في جلب المستخدمين:', error);
        res.json({ success: false, message: "حدث خطأ" }); 
    }
});

// ============================================
// API Routes - الإعدادات
// ============================================
app.get('/api/settings', (req, res) => {
    const settings = getSettings();
    // إخفاء API Key من الإعدادات العامة
    const publicSettings = { ...settings };
    delete publicSettings.geminiApiKey;
    res.json(publicSettings);
});

app.post('/api/settings', (req, res) => {
    try {
        const { adminUser, adminPass, newSettings } = req.body;
        const db = getDB();
        
        if (!checkAdmin(db, adminUser, adminPass)) {
            return res.json({ 
                success: false, 
                message: "غير مصرح لك!" 
            });
        }
        
        const currentSettings = getSettings();
        const mergedSettings = { 
            ...currentSettings, 
            ...newSettings,
            geminiApiKey: newSettings.geminiApiKey !== undefined ? 
                newSettings.geminiApiKey : currentSettings.geminiApiKey
        };
        
        saveSettings(mergedSettings);
        
        const publicSettings = { ...mergedSettings };
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
app.post('/api/reviews/add', (req, res) => {
    try {
        const { username, rating, text } = req.body;
        
        if (!username || typeof rating !== 'number' || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: "بيانات غير صالحة" });
        }
        
        const revs = getReviews();
        revs.reviews.push({ 
            username: String(username).substring(0, 50), 
            rating: Math.min(5, Math.max(1, rating)), 
            text: text ? String(text).substring(0, 500) : '', 
            date: new Date().toISOString() 
        });
        
        saveReviews(revs);
        res.json({ success: true });
    } catch (error) {
        console.error('خطأ في إضافة التقييم:', error);
        res.status(500).json({ success: false, message: "حدث خطأ" });
    }
});

app.post('/api/admin/reviews', (req, res) => {
    try {
        const { adminUser, adminPass } = req.body;
        const db = getDB();
        
        if (!checkAdmin(db, adminUser, adminPass)) {
            return res.status(403).json({ success: false, message: "غير مصرح" });
        }
        
        res.json({ 
            success: true, 
            reviews: getReviews().reviews.reverse() 
        });
    } catch (error) {
        console.error('خطأ في جلب التقييمات:', error);
        res.status(500).json({ success: false, message: "حدث خطأ" });
    }
});

// ============================================
// API Routes - لوحة المتصدرين
// ============================================
app.get('/api/leaderboard', (req, res) => {
    try {
        const db = getDB();
        const list = Object.keys(db.users)
            .map(name => ({ 
                username: name, 
                score: db.users[name].highScore || 0, 
                maxLvl: db.users[name].stats?.maxLvl || 0,
                kingdom: db.users[name].kingdom || "", 
                alliance: db.users[name].alliance || "", 
                avatarUrl: db.users[name].avatarUrl || ""
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
        
        res.json(list);
    } catch (error) {
        console.error('خطأ في لوحة المتصدرين:', error);
        res.status(500).json([]);
    }
});

// ============================================
// API Route - Gemini AI (من السيرفر فقط)
// ============================================
app.post('/api/ai/chat', async (req, res) => {
    try {
        const { username, password, message } = req.body;
        const db = getDB();
        
        if (!db.users[username] || db.users[username].password !== password) {
            return res.status(403).json({ success: false, message: "غير مصرح" });
        }
        
        const settings = getSettings();
        
        if (!settings.geminiApiKey) {
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
// Socket.io - الوقت الحقيقي
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
// معالجة الأخطاء العامة
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
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🦂 السيرفر شغال ومستعد لاستقبال الأجهزة على المنفذ ${PORT}`);
    console.log(`📍 الرابط: http://localhost:${PORT}`);
    console.log(`🔒 وضع التشغيل: ${process.env.NODE_ENV || 'development'}`);
});
