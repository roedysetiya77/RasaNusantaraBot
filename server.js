// ==============================================================================
// 1. SUNTIKAN GLOBAL CRYPTO
// ==============================================================================
if (!globalThis.crypto) {
    globalThis.crypto = require('crypto');
}

// ==============================================================================
// 2. IMPORT MODULES
// ==============================================================================
let makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers;
const express = require('express');
const config = require('./config');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

let sock = null;
let isReady = false;

// Fungsi untuk memuat Baileys secara dinamis
async function loadBaileys() {
    const baileys = await import('@whiskeysockets/baileys');
    
    // Perbaikan: Mengambil langsung dari objek modul (bukan .default)
    makeWASocket = baileys.makeWASocket;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    DisconnectReason = baileys.DisconnectReason;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    Browsers = baileys.Browsers;
    
    if (!makeWASocket) {
        throw new Error("Gagal mengambil fungsi makeWASocket. Pastikan versi @whiskeysockets/baileys terinstal dengan benar.");
    }
    
    console.log("✅ Modul Baileys berhasil dimuat.");
}

// ==============================================================================
// 3. KONEKSI UTAMA WHATSAPP
// ==============================================================================
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    try {
        const { version } = await fetchLatestBaileysVersion();
        
        sock = makeWASocket({
            auth: state,
            version: version, 
            printQRInTerminal: true, 
            browser: Browsers.ubuntu('Chrome'),
            connectTimeoutMs: 60000, 
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('SCAN QR CODE DI BAWAH INI:');
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('❌ Koneksi terputus, mencoba hubungkan ulang:', shouldReconnect);
                if (shouldReconnect) connectToWhatsApp();
            } else if (connection === 'open') {
                console.log('✅ STATUS: READY & ONLINE!');
                isReady = true;
            }
        });
    } catch (err) {
        console.error('❌ Error:', err.message);
        setTimeout(connectToWhatsApp, 5000);
    }
}

// ==============================================================================
// 4. API ENDPOINT
// ==============================================================================
app.post('/api/send-notification', async (req, res) => {
    const { phone, message } = req.body;
    if (!isReady) return res.status(503).json({ message: 'Bot belum ready' });

    try {
        let formattedPhone = phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        await sock.sendMessage(formattedPhone, { text: message });
        return res.json({ status: 'success' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// ==============================================================================
// RUNNER UTAMA
// ==============================================================================
loadBaileys().then(() => {
    connectToWhatsApp();
    const PORT = process.env.PORT || config.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server berjalan di port ${PORT}`));
}).catch(err => console.error("❌ Gagal memulai:", err));
