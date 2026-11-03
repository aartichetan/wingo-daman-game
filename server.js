const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

// Database Pool Config (Auto-detects URL or falls back to local simulation memory if not available)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

let timer = 60; 
let currentServerSeed = "";
let currentHash = "";
let gameHistory = [];
let roundCounter = 1;

// Database Table structure logic for Users
async function initDB() {
    if (process.env.DATABASE_URL) {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                mobile VARCHAR(15) UNIQUE NOT NULL,
                password TEXT NOT NULL,
                wallet INT DEFAULT 100
            );
        `);
        console.log('Cloud Database tables active!');
    } else {
        console.log('Running in memory fallback mode.');
    }
}
initDB().catch(console.error);

// Virtual In-Memory storage fallback in case database variables take time to load
let memoryUsers = {};

function getDamanPeriod() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const roundStr = String(roundCounter).padStart(4, '0');
    return `${yyyy}${mm}${dd}${roundStr}`;
}

function generateNewRound() {
    currentServerSeed = crypto.randomBytes(16).toString('hex');
    currentHash = crypto.createHash('sha256').update(currentServerSeed).digest('hex');
}

function calculateResult() {
    let clientSeed = "daman_client_secure"; 
    let period = getDamanPeriod();
    let combinedMessage = `${clientSeed}:${period}`;
    
    let gameHash = crypto.createHmac('sha512', currentServerSeed).update(combinedMessage).digest('hex');
    let hexString = gameHash.substring(0, 8);
    let decimalNumber = parseInt(hexString, 16);
    let finalNumber = decimalNumber % 10;
    
    let color = "Green";
    if (finalNumber === 0 || finalNumber === 5) color = "Violet";
    else if (finalNumber % 2 === 0) color = "Red";

    let size = (finalNumber >= 5) ? "Big" : "Small";

    let resultData = {
        period: period,
        number: finalNumber,
        color: color,
        size: size,
        serverSeed: currentServerSeed,
        hash: currentHash
    };

    gameHistory.unshift(resultData);
    if (gameHistory.length > 10) gameHistory.pop();
    roundCounter++;
    return resultData;
}

generateNewRound();

// --- SECURE USER ROUTING WITH FALLBACK CHECKS ---
app.post('/api/register', async (req, res) => {
    try {
        const { mobile, password } = req.body;
        if(!mobile || !password) return res.status(400).json({ error: "Missing fields" });
        const hashedPassword = await bcrypt.hash(password, 10);

        if (process.env.DATABASE_URL) {
            const check = await pool.query('SELECT * FROM users WHERE mobile = $1', [mobile]);
            if(check.rows.length > 0) return res.status(400).json({ error: "Already registered" });
            
            await pool.query('INSERT INTO users (mobile, password, wallet) VALUES ($1, $2, $3)', [mobile, hashedPassword, 100]);
        } else {
            if(memoryUsers[mobile]) return res.status(400).json({ error: "Already registered" });
            memoryUsers[mobile] = { password: hashedPassword, wallet: 100 };
        }
        res.json({ message: "Registration successful!" });
    } catch (err) {
        res.status(500).json({ error: "Registration failed" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { mobile, password } = req.body;
        let user;

        if (process.env.DATABASE_URL) {
            const result = await pool.query('SELECT * FROM users WHERE mobile = $1', [mobile]);
            if(result.rows.length === 0) return res.status(400).json({ error: "User not found" });
            user = result.rows[0];
        } else {
            if(!memoryUsers[mobile]) return res.status(400).json({ error: "User not found" });
            user = memoryUsers[mobile];
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if(!isMatch) return res.status(400).json({ error: "Wrong password" });

        res.json({ message: "Login success", wallet: user.wallet, mobile: mobile });
    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
});

setInterval(() => {
    if (timer > 0) {
        timer--;
    } else {
        let roundResult = calculateResult();
        io.emit('round_ended', roundResult);
        timer = 60;
        generateNewRound();
    }
    io.emit('timer_update', {
        timer: timer,
        currentHash: currentHash,
        nextPeriod: getDamanPeriod()
    });
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`System initialized running on port ${PORT}`);
});

