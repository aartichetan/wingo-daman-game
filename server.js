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

let timer = 30; 
let roundCounter = 10874; 
let gameHistory = [];
let databaseUsers = {}; // Secure dictionary for handling real live sessions runtime

function getDamanPeriod() {
    return `202611011000${roundCounter}`;
}

let currentServerSeed = crypto.randomBytes(16).toString('hex');

app.post('/api/register', async (req, res) => {
    const { mobile, password } = req.body;
    if(!mobile || !password) return res.status(400).json({ error: "Invalid data arrays" });
    if(databaseUsers[mobile]) return res.status(400).json({ error: "User profile exists already" });
    
    const hash = await bcrypt.hash(password, 10);
    databaseUsers[mobile] = { password: hash, wallet: 500 }; // ₹500 Signup Bonus
    res.json({ message: "Account registered successfully! Please Login." });
});

app.post('/api/login', async (req, res) => {
    const { mobile, password } = req.body;
    if(!databaseUsers[mobile]) return res.status(400).json({ error: "Account not registered!" });
    
    const match = await bcrypt.compare(password, databaseUsers[mobile].password);
    if(!match) return res.status(400).json({ error: "Wrong security password match" });
    
    res.json({ message: "Logged in successfully!", wallet: databaseUsers[mobile].wallet });
});

io.on('connection', (socket) => {
    socket.on('simulate_deposit', (data) => {
        if(databaseUsers[data.mobile]) {
            databaseUsers[data.mobile].wallet += data.amount;
            socket.emit('wallet_refresh', databaseUsers[data.mobile].wallet);
        }
    });

    socket.on('place_simulation_bet', (data) => {
        let user = databaseUsers[data.mobile];
        if(!user) return socket.emit('bet_status', { msg: "Authentication session expired" });
        if(user.wallet < data.cost) return socket.emit('bet_status', { msg: "Insufficient balance limits!" });
        
        user.wallet -= data.cost;
        socket.emit('wallet_refresh', user.wallet);
        socket.emit('bet_status', { msg: `Bet order of ₹${data.cost} registered on [${data.target}]` });
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
server.listen(PORT, () => console.log(`Active core running on port ${PORT}`));
