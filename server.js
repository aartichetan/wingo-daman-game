const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

let timer = 60; 
let currentServerSeed = "";
let currentHash = "";
let gameHistory = [];
let roundCounter = 1;
let memoryUsers = {}; // In-memory database fallback to prevent any database crash

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

app.post('/api/register', async (req, res) => {
    try {
        const { mobile, password } = req.body;
        if(!mobile || !password) return res.status(400).json({ error: "Missing fields" });
        const hashedPassword = await bcrypt.hash(password, 10);
        if(memoryUsers[mobile]) return res.status(400).json({ error: "Already registered" });
        memoryUsers[mobile] = { password: hashedPassword, wallet: 100 };
        res.json({ message: "Registration successful!" });
    } catch (err) {
        res.status(500).json({ error: "Registration failed" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { mobile, password } = req.body;
        if(!memoryUsers[mobile]) return res.status(400).json({ error: "User not found" });
        const isMatch = await bcrypt.compare(password, memoryUsers[mobile].password);
        if(!isMatch) return res.status(400).json({ error: "Wrong password" });
        res.json({ message: "Login success", wallet: memoryUsers[mobile].wallet, mobile: mobile });
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

