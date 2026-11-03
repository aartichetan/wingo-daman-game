const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

let timer = 30; // 30 seconds remaning dynamic loop start
let roundCounter = 10874; // Image ke mutabik sequence matching string counter
let gameHistory = [
    { period: "20261101100010873", number: 8, color: "Red" },
    { period: "20261101100010872", number: 9, color: "Green" },
    { period: "20261101100010871", number: 2, color: "Red" }
];

function getDamanPeriod() {
    return `202611011000${roundCounter}`;
}

let currentServerSeed = crypto.randomBytes(16).toString('hex');
let currentHash = crypto.createHash('sha256').update(currentServerSeed).digest('hex');

function calculateResult() {
    let clientSeed = "dmfirst_secure_entropy"; 
    let period = getDamanPeriod();
    let combinedMessage = `${clientSeed}:${period}`;
    
    let gameHash = crypto.createHmac('sha512', currentServerSeed).update(combinedMessage).digest('hex');
    let hexString = gameHash.substring(0, 8);
    let decimalNumber = parseInt(hexString, 16);
    let finalNumber = decimalNumber % 10;
    
    let color = "Green";
    if (finalNumber === 0 || finalNumber === 5) color = "Violet";
    else if (finalNumber % 2 === 0) color = "Red";

    let resultData = {
        period: period,
        number: finalNumber,
        color: color
    };

    gameHistory.unshift(resultData);
    if (gameHistory.length > 8) gameHistory.pop();
    
    roundCounter++;
    currentServerSeed = crypto.randomBytes(16).toString('hex');
    currentHash = crypto.createHash('sha256').update(currentServerSeed).digest('hex');
    
    return resultData;
}

setInterval(() => {
    if (timer > 0) {
        timer--;
    } else {
        let roundResult = calculateResult();
        io.emit('round_ended', { result: roundResult, history: gameHistory });
        timer = 30;
    }
    io.emit('timer_update', {
        timer: timer,
        nextPeriod: getDamanPeriod(),
        history: gameHistory
    });
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`DmFirst Engine active on port ${PORT}`);
});
