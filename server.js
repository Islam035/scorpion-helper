/**
 * 🦂 المساعد عقروب V1.15 - العقل المدبر (الخادم)
 * تم ضبطه ليتوافق مع المزامنة البصرية والذكاء الاصطناعي المقارن
 */

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// ============================================
// الإعدادات الأساسية
// ============================================
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL;

let isDbConnected = false;

// ============================================
// Middleware
// ============================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// حماية المسارات في حال عدم اتصال قاعدة البيانات
app.use((req, res, next) => {
    if (!isDbConnected && req.path.startsWith('/api/') && req.path !== '/api/settings') {
        return res.json({ success: false, message: "الخدمة غير متاحة مؤقتاً، قاعدة البيانات غير متصلة" });
    }
    next();
});

// ============================================
// Schemas (قاعدة البيانات)
// ============================================
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    displayName: { type: String, default: "" },
    kingdom: { type: String, default: "" },
    alliance: { type: String, default: "" },
    isAdmin: { type: Boolean, default: false },
    highScore: { type: Number, default: 0 },
    sessionScore: { type: Number, default: 0 },
    energy: { type: Number, default: 200 },
    grid: { type: Array, default: null },
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
    appName: { type: String, default: "مساعد عقروب V1.15" },
    logoUrl: { type: String, default: "" },
    geminiApiKey: { type: String, default: "" },
    animals: { type: Object, default: {} },
    eventEndTime: { type: Date, default: null }
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

// ============================================
// دوال مساعدة (تجديد اليوميات)
// ============================================
async function resetDailyUsageIfNeeded(user) {
    const now = new Date();
    const egyptTime = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
    
    let lastReset = user.lastDailyReset ? new Date(user.lastDailyReset.toLocaleString("en-US", { timeZone: "Africa/Cairo" })) : null;

    // إعادة التعيين يومياً الساعة 2 صباحاً بتوقيت مصر
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

        if (currentTarget.getTime() > lastResetTarget.getTime()) {
            needsReset = true;
        }
    }

    if (needsReset) {
        if(user.tools) {
            if(user.tools.gem) user.tools.gem.used = 0;
            if(user.tools.upgrade) { user.tools.upgrade.used = 0; user.tools.upgrade.dailyLimit = 20; }
            if(user.tools.claw) { user.tools.claw.used = 0; user.tools.claw.dailyLimit = 20; }
            if(user.tools.wheel) { user.tools.wheel.used = 0; user.tools.wheel.dailyLimit = 20; }
        }
        user.lastDailyReset = now;
        await user.save();
    }
}

// ============================================
// API Routes (مسارات الخادم)
// ============================================

// 1. جلب الإعدادات (عامة)
app.get('/api/settings', async (req, res) => {
    try {
        if (!isDbConnected) return res.json({});
        let settings = await Settings.findOne({ key: 'main' });
        if (!settings) return res.json({});
        
        const publicSettings = settings.toObject();
        delete publicSettings.geminiApiKey; // حماية مفتاح الأمان
        res.json(publicSettings);
    } catch (err) { res.json({}); }
});

// 2. تسجيل الدخول والمزامنة
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // حساب المدير الافتراضي إذا لم يوجد
        if (username === 'admin' && password === 'admin123') {
            let admin = await User.findOne({ username: 'admin' });
            if (!admin) {
                admin = await User.create({ username: 'admin', password: 'admin123', isAdmin: true, displayName: "المدير العام" });
            }
        }

        let user = await User.findOne({ username });
        if (!user) {
            // إنشاء حساب جديد
            user = await User.create({ username, password });
        } else if (user.password !== password) {
            return res.json({ success: false, message: "كلمة المرور غير صحيحة" });
        }

        await resetDailyUsageIfNeeded(user);

        res.json({
            success: true, 
            isAdmin: user.isAdmin,
            userData: {
                displayName: user.displayName, kingdom: user.kingdom, alliance: user.alliance,
                sessionScore: user.sessionScore, energy: user.energy, grid: user.grid, tools: user.tools
            }
        });
    } catch (err) { res.status(500).json({ success: false, message: "خطأ داخلي" }); }
});

// 3. حفظ بيانات اللعبة (المزامنة)
app.post('/api/user/save', async (req, res) => {
    try {
        const { username, password, grid, energy, sessionScore, tools } = req.body;
        const user = await User.findOne({ username, password });
        if (user) {
            if (grid) user.grid = grid;
            if (energy !== undefined) user.energy = energy;
            if (sessionScore !== undefined) {
                user.sessionScore = sessionScore;
                if (sessionScore > user.highScore) user.highScore = sessionScore;
            }
            if (tools) user.tools = tools;
            await user.save();
            res.json({ success: true });
        } else {
            res.status(403).json({ success: false });
        }
    } catch (err) { res.status(500).json({ success: false }); }
});

// 4. الذكاء الاصطناعي (محلل المخاطر)
app.post('/api/ai/analyze', async (req, res) => {
    try {
        const { username, password, prompt } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) return res.json({ success: false, message: "غير مصرح" });

        const settings = await Settings.findOne({ key: 'main' });
        const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) return res.json({ success: false, message: "لم يتم تكوين مفتاح الذكاء الاصطناعي في لوحة الإدارة." });

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 250 } // حرارة منخفضة لضمان دقة الاستراتيجية
            })
        });

        const data = await response.json();
        if (data.candidates && data.candidates[0]) {
            res.json({ success: true, response: data.candidates[0].content.parts[0].text });
        } else {
            res.json({ success: false });
        }
    } catch (err) { res.json({ success: false }); }
});

// 5. حفظ إعدادات الإدارة
app.post('/api/settings', async (req, res) => {
    try {
        const { adminUser, adminPass, newSettings } = req.body;
        const admin = await User.findOne({ username: adminUser, password: adminPass });
        if (!admin || !admin.isAdmin) return res.status(403).json({ success: false });

        let settings = await Settings.findOne({ key: 'main' });
        if (!settings) settings = new Settings({ key: 'main' });

        if (newSettings.appName !== undefined) settings.appName = newSettings.appName;
        if (newSettings.logoUrl !== undefined) settings.logoUrl = newSettings.logoUrl;
        if (newSettings.eventEndTime !== undefined) settings.eventEndTime = newSettings.eventEndTime;
        if (newSettings.geminiApiKey !== undefined && newSettings.geminiApiKey.trim() !== "") settings.geminiApiKey = newSettings.geminiApiKey;
        if (newSettings.animals !== undefined) settings.animals = newSettings.animals;

        await settings.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 6. جلب بيانات اللاعبين للمدير
app.post('/api/admin/users', async (req, res) => {
    try {
        const { adminUser, adminPass } = req.body;
        const admin = await User.findOne({ username: adminUser, password: adminPass });
        if (!admin || !admin.isAdmin) return res.status(403).json({ success: false });

        const users = await User.find({}).select('-password -grid').sort({ sessionScore: -1 });
        res.json({ success: true, users });
    } catch (err) { res.json({ success: false }); }
});

// 7. إضافة تقييم
app.post('/api/review/add', async (req, res) => {
    try {
        const { username, rating, text } = req.body;
        await Review.create({ username, rating, text });
        res.json({ success: true });
    } catch (err) { res.json({ success: false }); }
});

// ============================================
// الاتصال والتشغيل
// ============================================
const connectDB = async () => {
    try {
        if (!MONGODB_URI) {
            console.warn('⚠️ تنبيه: MONGODB_URI غير موجود، السيرفر يعمل بدون قاعدة بيانات.');
            return false;
        }
        await mongoose.connect(MONGODB_URI);
        isDbConnected = true;
        console.log('✅ متصل بقاعدة بيانات MongoDB Atlas');
        
        // إعداد أولي للـ Settings إذا كانت فارغة
        const settingsCount = await Settings.countDocuments();
        if (settingsCount === 0) {
            await Settings.create({ key: 'main', appName: "مساعد عقروب V1.15" });
            console.log('✅ تم إنشاء إعدادات افتراضية');
        }
    } catch (err) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
        isDbConnected = false;
    }
};

connectDB().then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🦂 السيرفر يعمل على المنفذ ${PORT}`);
    });
});