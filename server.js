const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static('public'));
app.use(express.json());

let timer = 30; 
let roundCounter = 10874; 
let gameHistory = [];

// Temporary storage (Bina database ke users save rakhne ke liye)
let temporaryUsers = {}; 

function getDamanPeriod() {
    return `202611011000${roundCounter}`;
}

let currentServerSeed = crypto.randomBytes(16).toString('hex');

// 1. REGISTER API (Bina database crash ke kaam karegi)
app.post('/api/register', (req, res) => {
    const { mobile, password } = req.body;
    if(!mobile || !password) return res.status(400).json({ error: "Fields cannot be empty!" });
    if(temporaryUsers[mobile]) return res.status(400).json({ error: "Mobile number already registered!" });
    
    // Memory me user save karna
    temporaryUsers[mobile] = { password: password, wallet: 500 }; // ₹500 FREE BONUS
    res.json({ message: "Registration successful! Auto-logging in..." });
});

// 2. LOGIN API
app.post('/api/login', (req, res) => {
    const { mobile, password } = req.body;
    if(!temporaryUsers[mobile]) return res.status(400).json({ error: "User not found! Please register first." });
    if(temporaryUsers[mobile].password !== password) return res.status(400).json({ error: "Incorrect password!" });
    
    res.json({ message: "Logged in successfully!", wallet: temporaryUsers[mobile].wallet });
});

io.on('connection', (socket) => {
    socket.on('simulate_deposit', (data) => {
        if(temporaryUsers[data.mobile]) {
            temporaryUsers[data.mobile].wallet += data.amount;
            socket.emit('wallet_refresh', temporaryUsers[data.mobile].wallet);
        }
    });

    socket.on('place_simulation_bet', (data) => {
        let user = temporaryUsers[data.mobile];
        if(!user) return socket.emit('bet_status', { msg: "Session expired, please login again!" });
        if(user.wallet < data.cost) return socket.emit('bet_status', { msg: "Insufficient balance!" });
        
        user.wallet -= data.cost;
        socket.emit('wallet_refresh', user.wallet);
        socket.emit('bet_status', { msg: `Bet of ₹${data.cost} placed on [${data.target}]` });
    });
});

setInterval(() => {
    if (timer > 0) {
        timer--;
    } else {
        let period = getDamanPeriod();
        let gameHash = crypto.createHmac('sha512', currentServerSeed).update(`dmfirst:${period}`).digest('hex');
        let finalNumber = parseInt(gameHash.substring(0, 8), 16) % 10;
        
        let color = "Green";
        if (finalNumber === 0 || finalNumber === 5) color = "Violet";
        else if (finalNumber % 2 === 0) color = "Red";

        let resultData = { period: period, number: finalNumber, color: color };
        gameHistory.unshift(resultData);
        if (gameHistory.length > 10) gameHistory.pop();
        
        roundCounter++;
        timer = 30;
        io.emit('round_ended', { result: resultData, history: gameHistory });
    }
    io.emit('timer_update', { timer: timer, nextPeriod: getDamanPeriod(), history: gameHistory });
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server active on port ${PORT}`));
