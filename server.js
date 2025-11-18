const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'forex-trading-secret-key-2024';

// ==================== DATABASE ==================== 
const users = {};
const trades = {};
const robots = {};

// ==================== UTILITY FUNCTIONS ====================
const generateToken = (email) => {
  return jwt.sign({ email }, JWT_SECRET, { expiresIn: '30d' });
};

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==================== AUTHENTICATION ====================

// REGISTER
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    if (users[email]) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    users[email] = {
      id: uuidv4(),
      name,
      email,
      password: hashedPassword,
      accountBalance: 1000,
      equity: 1000,
      openTrades: [],
      tradeHistory: [],
      robotConfig: null,
      createdAt: new Date(),
    };
    
    const token = generateToken(email);
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: users[email].id,
        name,
        email,
        accountBalance: 1000,
        equity: 1000
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    if (!users[email]) {
      return res.status(400).json({ error: 'User not found' });
    }
    
    const user = users[email];
    const isValid = await bcrypt.compare(password, user.password);
    
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid password' });
    }
    
    const token = generateToken(email);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        accountBalance: user.accountBalance,
        equity: user.equity
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ACCOUNT MANAGEMENT ====================

// GET ACCOUNT INFO
app.get('/api/account/info', verifyToken, (req, res) => {
  try {
    const user = users[req.user.email];
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      accountBalance: user.accountBalance,
      equity: user.equity,
      openTradesCount: user.openTrades.length,
      createdAt: user.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== TRADING ====================

// PLACE BUY ORDER
app.post('/api/trade/buy', verifyToken, (req, res) => {
  try {
    const { symbol, volume, entryPrice, stopLoss, takeProfit } = req.body;
    const user = users[req.user.email];
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const trade = {
      id: uuidv4(),
      type: 'BUY',
      symbol,
      volume,
      entryPrice,
      stopLoss,
      takeProfit,
      status: 'OPEN',
      openTime: new Date(),
      pnl: 0
    };
    
    user.openTrades.push(trade);
    user.accountBalance -= (volume * entryPrice);
    
    res.status(201).json({
      success: true,
      message: 'Buy order placed',
      trade,
      accountBalance: user.accountBalance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PLACE SELL ORDER
app.post('/api/trade/sell', verifyToken, (req, res) => {
  try {
    const { symbol, volume, entryPrice, stopLoss, takeProfit } = req.body;
    const user = users[req.user.email];
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const trade = {
      id: uuidv4(),
      type: 'SELL',
      symbol,
      volume,
      entryPrice,
      stopLoss,
      takeProfit,
      status: 'OPEN',
      openTime: new Date(),
      pnl: 0
    };
    
    user.openTrades.push(trade);
    user.accountBalance -= (volume * entryPrice);
    
    res.status(201).json({
      success: true,
      message: 'Sell order placed',
      trade,
      accountBalance: user.accountBalance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET OPEN TRADES
app.get('/api/trade/open', verifyToken, (req, res) => {
  try {
    const user = users[req.user.email];
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const openTrades = user.openTrades.filter(t => t.status === 'OPEN');
    
    res.json({
      success: true,
      openTrades,
      count: openTrades.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CLOSE TRADE
app.post('/api/trade/close/:tradeId', verifyToken, (req, res) => {
  try {
    const { tradeId } = req.params;
    const { closePrice } = req.body;
    const user = users[req.user.email];
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const trade = user.openTrades.find(t => t.id === tradeId);
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    
    // Calculate P&L
    let pnl;
    if (trade.type === 'BUY') {
      pnl = (closePrice - trade.entryPrice) * trade.volume;
    } else {
      pnl = (trade.entryPrice - closePrice) * trade.volume;
    }
    
    trade.status = 'CLOSED';
    trade.closePrice = closePrice;
    trade.closeTime = new Date();
    trade.pnl = pnl;
    
    user.accountBalance += (trade.volume * closePrice) + pnl;
    user.tradeHistory.push(trade);
    user.openTrades = user.openTrades.filter(t => t.id !== tradeId);
    
    res.json({
      success: true,
      message: 'Trade closed',
      trade,
      pnl,
      accountBalance: user.accountBalance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET TRADE HISTORY
app.get('/api/trade/history', verifyToken, (req, res) => {
  try {
    const user = users[req.user.email];
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      success: true,
      history: user.tradeHistory,
      count: user.tradeHistory.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ROBOT CONFIGURATION ====================

// SET ROBOT CONFIG
app.post('/api/robot/config', verifyToken, (req, res) => {
  try {
    const { fastMA, slowMA, rsiPeriod, lotSize, maxPositions, riskPercent } = req.body;
    const user = users[req.user.email];
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.robotConfig = {
      fastMA,
      slowMA,
      rsiPeriod,
      lotSize,
      maxPositions,
      riskPercent,
      createdAt: new Date()
    };
    
    res.json({
      success: true,
      message: 'Robot configuration saved',
      config: user.robotConfig
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET ROBOT CONFIG
app.get('/api/robot/config', verifyToken, (req, res) => {
  try {
    const user = users[req.user.email];
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({
      success: true,
      config: user.robotConfig || {
        fastMA: 50,
        slowMA: 200,
        rsiPeriod: 14,
        lotSize: 0.01,
        maxPositions: 5,
        riskPercent: 0.2
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== HEALTH CHECK ====================
app.get('/', (req, res) => {
  res.json({
    message: 'RoyFX Forex Trading App API',
    status: 'Online',
    version: '1.0.0',
    endpoints: {
      auth: ['/api/auth/register', '/api/auth/login'],
      account: ['/api/account/info'],
      trading: ['/api/trade/buy', '/api/trade/sell', '/api/trade/open', '/api/trade/close/:tradeId', '/api/trade/history'],
      robot: ['/api/robot/config']
    }
  });
});

// ==================== START SERVER ====================
server.listen(PORT, () => {
  console.log(`🚀 Forex Trading App running on port ${PORT}`);
  console.log(`📍 API URL: http://localhost:${PORT}`);
});
