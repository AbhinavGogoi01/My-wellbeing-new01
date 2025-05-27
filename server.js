const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure CORS - More permissive for development
app.use(cors({
  origin: "*",  // In production, replace with specific origins
  methods: ["GET", "POST"],
  credentials: true
}));

const io = socketIo(server, {
  cors: {
    origin: "*",  // In production, replace with specific origins
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,  // Increased ping timeout
  pingInterval: 25000  // Increased ping interval
});

// Store active rooms and their participants
const rooms = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount,
    rooms: {
      total: rooms.size,
      active: Array.from(rooms.keys())
    }
  });
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);
  
  socket.on('join-room', (roomId, userId) => {
    console.log(`👤 User ${userId} joining room ${roomId}`);
    
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(userId);
    
    socket.broadcast.to(roomId).emit('user-connected', userId);
    console.log(`👤 User ${userId} joined room ${roomId}`);
    
    socket.on('disconnect', () => {
      console.log(`🔌 User ${userId} disconnected from room ${roomId}`);
      
      const room = rooms.get(roomId);
      if (room) {
        room.delete(userId);
        if (room.size === 0) {
          rooms.delete(roomId);
        }
      }
      
      // Notify others
      socket.broadcast.to(roomId).emit('user-disconnected', userId);
      console.log(`👤 User ${userId} left room ${roomId}`);
    });
  });
  
  // Heartbeat handlers
  socket.on('heartbeat-ping', () => {
    socket.emit('heartbeat-pong', { timestamp: Date.now() });
  });
});

// Error handling
server.on('error', (error) => {
  console.error('Server error:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`\n🚀 SIGNALING SERVER RUNNING`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});
