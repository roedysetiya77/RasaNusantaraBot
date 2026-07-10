// ==============================================================================
// 1. SUNTIKAN GLOBAL CRYPTO (Wajib untuk Node.js v18 di Shared Hosting cPanel)
// ==============================================================================
if (!globalThis.crypto) {
    globalThis.crypto = require('crypto');
}

// ==============================================================================
// 2. IMPORT MODULES
// ==============================================================================
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const config = require('./config');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

let sock = null;
let isReady = false;

// Monitoring Request Log
app.use((req, res, next) => {
    console.log(`\n[${new Date().toLocaleTimeString()}] 📥 [${req.method}] Akses: ${req.url}`);
    next();
});

// Jalur tes halaman utama
app.get('/', (req, res) => {
    res.send('🚀 RasaNusantaraBot API Gateway (Baileys) Status: ONLINE!');
});

// ==============================================================================
// 3. KONEKSI UTAMA WHATSAPP (BAILEYS + PAIRING CODE GENERATOR)
// ==============================================================================
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    try {
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📡 Menggunakan WA Web v${version.join('.')}, Terupdate: ${isLatest}`);

        sock = makeWASocket({
            auth: state,
            version: version, 
            printQRInTerminal: false, // Dimatikan karena kita pakai pairing code
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 60000, 
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: true,
            syncFullHistory: false
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // 🔥 Handler Generator Pairing Code (Menggantikan Scan Barcode)
            if (qr) {
                console.clear();
                console.log('==================================================');
                console.log('🔑 MENGGUNAKAN PAIRING CODE (TANPA SCAN KAMERA)');
                console.log('==================================================');
                
                // Mengambil nomor HP bot dari config
                let nomorBot = config.ADMIN_NUMBER.replace(/[^0-9]/g, ''); 
                
                setTimeout(async () => {
                    try {
                        let code = await sock.requestPairingCode(nomorBot);
                        code = code?.match(/.{1,4}/g)?.join('-') || code;
                        console.log(`👉 MASUKKAN KODE INI DI HP KAMU: \x1b[36m${code}\x1b[0m`);
                        console.log('==================================================');
                        console.log('Caranya: Buka WA HP -> Perangkat Tertaut -> Tautkan Perangkat -> Tautkan dengan nomor telepon saja');
                    } catch (err) {
                        console.log('⚠️ Gagal membuat pairing code:', err.message);
                    }
                }, 3000);
            }

            // Handler Status Koneksi
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('❌ Koneksi terputus karena:', lastDisconnect?.error, ', mencoba hubungkan ulang:', shouldReconnect);
                isReady = false;
                if (shouldReconnect) {
                    connectToWhatsApp();
                }
            } else if (connection === 'open') {
                console.clear();
                console.log('==================================================');
                console.log('✅ WHATSAPP BOT (BAILEYS) STATUS: READY & ONLINE!');
                console.log('🚀 Menunggu lemparan data API dari website...');
                console.log('==================================================');
                isReady = true;

                try {
                    await sock.sendMessage(`${config.ADMIN_NUMBER}@s.whatsapp.net`, { text: '🚀 Bot RasaNusantara (Baileys) siap menerima tembakan data!' });
                } catch (e) {
                    console.log('⚠️ Gagal kirim notif awal ke admin:', e.message);
                }
            }
        });

    } catch (err) {
        console.error('❌ Gagal menginisialisasi biner Baileys:', err.message);
        setTimeout(connectToWhatsApp, 5000);
    }
}

// ==============================================================================
// 4. ENDPOINT API UTAMA
// ==============================================================================
app.post('/api/send-notification', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ status: 'failed', message: 'Data tidak lengkap' });
    }

    if (!isReady || !sock) {
        return res.status(503).json({ status: 'error', message: 'WhatsApp Bot belum ready' });
    }

    try {
        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '62' + formattedPhone.slice(1);
        }
        formattedPhone = `${formattedPhone}@s.whatsapp.net`;

        console.log(`[${new Date().toLocaleTimeString()}] ⏳ Mengirim pesan ke -> ${formattedPhone}`);
        
        await sock.sendMessage(formattedPhone, { text: message });
        
        console.log(`[${new Date().toLocaleTimeString()}] 🎉 SUKSES: Notifikasi terkirim.`);
        return res.json({ status: 'success', message: 'Notifikasi berhasil dikirim' });

    } catch (error) {
        console.error('❌ ERROR WA:', error.message);
        return res.status(500).json({ status: 'error', error: error.message });
    }
});

// Jalankan sistem
connectToWhatsApp();

const PORT = process.env.PORT || config.PORT || 3000;
app.listen(PORT, () => {
    console.log('==================================================');
    console.log(`🚀 API Server internal berjalan di port ${PORT}`);
    console.log('==================================================');
});