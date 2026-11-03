const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const mongoose = require('mongoose'); // MongoDB Connection (Aap local ya cloud use kar sakte hain)
mongoose.connect('mongodb://localhost:27017/wingo_db')
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch(err => console.log('Database Connection Error:', err));

// User Schema Model
const userSchema = new mongoose.Schema({
    mobile: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    wallet: { type: Number, default: 0 }
});

const User = 

const bcrypt = require('bcryptjs');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let timer = 60; 
let currentServerSeed = "";
let currentHash = "";
let gameHistory = [];
let roundCounter = 1;

// Dummy Wallet aur active bets store karne ke liye
let userWallet = 10000; 
let activeBets = []; 

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
    activeBets = []; // Naye round ke liye bets khali
    console.log(`\n[Daman Loop] New Round Hash: ${currentHash}`);
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

    // --- BET EVALUATION LOGIC ---
    let totalWin = 0;
    activeBets.forEach(bet => {
        let isWin = false;
        if (bet.type === color || bet.type === size || bet.type == finalNumber) {
            isWin = true;
        }
        if (isWin) {
            if (['Green', 'Red', 'Big', 'Small'].includes(bet.type)) totalWin += bet.amount * 2;
            else if (bet.type === 'Violet') totalWin += bet.amount * 4.5;
            else totalWin += bet.amount * 9; // Exact Number Win
        }
    });

    userWallet += totalWin;
    resultData.walletBalance = userWallet;

    gameHistory.unshift(resultData);
    if (gameHistory.length > 10) gameHistory.pop();

    roundCounter++;
    return resultData;
}

generateNewRound();

// Live Players Connections
io.on('connection', (socket) => {
    // Naye user ko wallet balance bhejna
    socket.emit('wallet_update', userWallet);

    // Bet receive karne ka listener
    socket.on('place_bet', (betData) => {
        if (timer <= 5) return socket.emit('error_msg', 'Betting closed for this round!');
        if (userWallet < betData.amount) return socket.emit('error_msg', 'Insufficient Balance!');

        userWallet -= betData.amount;
        activeBets.push(betData);
        
        socket.emit('wallet_update', userWallet);
        socket.emit('bet_success', `Bet of ₹${betData.amount} placed on ${betData.type}`);
    });
});

setInterval(() => {
    if (timer > 0) {
        timer--;
    } else {
        let roundResult = calculateResult();
        io.emit('round_ended', roundResult);
        io.emit('wallet_update', userWallet);
        timer = 60;
        generateNewRound();
    }

    io.emit('timer_update', {
        timer: timer,
        currentHash: currentHash,
        nextPeriod: getDamanPeriod()
    });
}, 1000);
// Express middleware passwords aur body read karne ke liye
app.use(express.json());

// 1. REGISTRATION API
app.post('/api/register', async (req, res) => {
    try {
        const { mobile, password } = req.body;
        
        // Check karna ki user pehle se toh nahi hai
        const userExists = await User.findOne({ mobile });
        if(userExists) return res.status(400).json({ error: "Mobile number already registered!" });

        // Password ko secure (Hash) karna
        const hashedPassword = await bcrypt.hash(password, 10);

        // Naya user create karna ₹100 welcome bonus ke sath
        const newUser = new User({
            mobile,
            password: hashedPassword,
            wallet: 100 
        });

        await newUser.save();
        res.json({ message: "Registration successful! Open Login Page." });
    } catch (err) {
        res.status(500).json({ error: "Server Error during registration" });
    }
});

// 2. LOGIN API
app.post('/api/login', async (req, res) => {
    try {
        const { mobile, password } = req.body;
        
        // User ko dhoodhna
        const user = await User.findOne({ mobile });
        if(!user) return res.status(400).json({ error: "User not found!" });

        // Password check karna
        const isMatch = await bcrypt.compare(password, user.password);
        if(!isMatch) return res.status(400).json({ error: "Invalid password!" });

        res.json({ message: "Login successful!", wallet: user.wallet, mobile: user.mobile });
    } catch (err) {
        res.status(500).json({ error: "Server Error during login" });
    }
});

server.listen(3000, () => {
    console.log('Daman Full Engine running on http://localhost:3000');
});
