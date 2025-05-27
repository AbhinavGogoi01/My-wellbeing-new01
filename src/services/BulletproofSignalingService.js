import { io } from 'socket.io-client';
import { auth } from '../components/Auth/firebase';

class BulletproofSignalingService {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.onSignalCallback = null;
    this.isConnecting = false;
    this.connectionAttempts = 0;
    this.maxAttempts = 3; // Max connection attempts for a connect() call
    this.attemptTimeoutDuration = 10000; // Timeout for each individual attempt
    this.heartbeatInterval = null;
    this.reconnectTimeout = null;
    this.lastHeartbeat = null;
    this.serverUrl = 'http://localhost:3001';
  }

  async connect(roomId) {
    console.log(`\n🎯 CONNECTING TO SIGNALING SERVER (Service Call)`);
    console.log(`   Room: ${roomId}`);

    if (this.isConnecting) {
      console.log('⏳ Connection sequence already in progress...');
      // This should ideally return the existing promise or handle queueing.
      // For now, let's reject to prevent parallel unstable attempts.
      return Promise.reject(new Error('Connection sequence already in progress.'));
    }

    if (this.socket?.connected && this.roomId === roomId) {
      console.log('✅ Already connected to this room');
      return Promise.resolve();
    }

    await this.disconnect(); // Clean up any existing connection first

    this.isConnecting = true;
    this.roomId = roomId;
    this.connectionAttempts = 0; // Reset attempts for this new connect sequence

    return new Promise((resolve, reject) => {
      if (!auth.currentUser?.uid) {
        this.isConnecting = false;
        reject(new Error('User not authenticated'));
        return;
      }
      const userId = auth.currentUser.uid;
      console.log(`👤 User ID: ${userId}`);

      const attemptConnection = () => {
        if (this.connectionAttempts >= this.maxAttempts) {
          this.isConnecting = false;
          console.error(`❌ Failed to connect after ${this.maxAttempts} attempts.`);
          reject(new Error(`Failed to connect to signaling server after ${this.maxAttempts} attempts.`));
          return;
        }

        this.connectionAttempts++;
        console.log(`🔄 Connecting to: ${this.serverUrl} (Attempt ${this.connectionAttempts}/${this.maxAttempts})`);

        // Ensure previous socket is fully cleaned for this attempt
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.disconnect(); // Use disconnect for Socket.IO
          this.socket = null;
        }

        this.socket = io(this.serverUrl, {
          transports: ['polling', 'websocket'], // Match server's transport order
          timeout: 20000, // Increased timeout for initial connection
          forceNew: true, // Ensures a new connection, good for retries
          reconnection: false, // Disable Socket.IO's automatic reconnection; we manage retries.
          query: {
            roomId,
            userId,
          },
          extraHeaders: {
            "User-Agent": navigator.userAgent, // Help with debugging
          }
        });

        let attemptTimer = setTimeout(() => {
          console.warn(`⏰ Attempt ${this.connectionAttempts} timed out after ${this.attemptTimeoutDuration / 1000}s.`);
          if (this.socket) {
            console.log('🔄 Forcing disconnect due to timeout');
            this.socket.disconnect(); // Trigger cleanup and connect_error if it hasn't fired
            
            setTimeout(() => {
              if (this.isConnecting && this.connectionAttempts < this.maxAttempts) {
                console.log('🔄 Timeout recovery - trying next attempt');
                attemptConnection();
              }
            }, 500);
          }
        }, this.attemptTimeoutDuration + 1000); // Slightly longer than socket.io timeout

        this.socket.on('connect', () => {
          clearTimeout(attemptTimer);
          console.log(`✅ CONNECTED SUCCESSFULLY!`);
          console.log(`   Server: ${this.serverUrl}`);
          console.log(`   Socket ID: ${this.socket.id}`);
          console.log(`   Transport: ${this.socket.io.engine.transport.name}`);

          this.isConnecting = false;
          this.lastHeartbeat = Date.now();
          this.socket.emit('join-room', { roomId, userId });
          this.startHeartbeat();
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          clearTimeout(attemptTimer);
          console.warn(`❌ Connection attempt ${this.connectionAttempts} error: ${error.message}`);
          // Disconnect explicitly to clean up this socket instance before next attempt
          if (this.socket) {
            this.socket.disconnect();
          }
          // Proceed to the next attempt or fail
          setTimeout(attemptConnection, 2000); // Wait 2s before next attempt
        });
        
        this.socket.on('disconnect', (reason) => {
          // This handles disconnects *after* a connection was made, or if server drops.
          // For initial connection failures, 'connect_error' is the primary event.
          console.log(`🔌 Socket disconnected during connection phase. Reason: ${reason}`);
          // If 'connect_error' didn't handle this, and we are still in isConnecting phase, retry.
          // This might be redundant if connect_error always fires for failed initial connections.
          // clearTimeout(attemptTimer); // already cleared by connect or connect_error usually
          // if (this.isConnecting) { // Ensure we are still in the initial connection process
          //  console.log('Disconnected during connection attempt, trying next.');
          //  attemptConnection();
          // }
        });

        // Other event handlers (signal, room-joined etc.) should be ideally set up
        // after successful connection, or ensure they are re-bound if socket is recreated.
        // For simplicity here, they are bound each time.
        this.socket.on('connection_success', (data) => console.log('🎉 SERVER ACKNOWLEDGED CONNECTION', data));
        this.socket.on('room-joined', (data) => console.log('🏠 SUCCESSFULLY JOINED ROOM', data));
        this.socket.on('signal', (data) => {
          if (data.fromUserId === userId) return;
          if (this.onSignalCallback) this.onSignalCallback(data);
        });
        this.socket.on('error', (socketError) => console.error('💣 Socket.IO reported an error:', socketError));

      }; // End of attemptConnection

      attemptConnection(); // Start the first attempt
    });
  }

  async disconnect() {
    console.log('🔌 Disconnecting from signaling server (Service Call)...');
    this.stopHeartbeat();
    clearTimeout(this.reconnectTimeout); // Clear any scheduled auto-reconnect
    
    if (this.socket) {
      this.socket.removeAllListeners(); // Clean up listeners
      this.socket.disconnect(); // Use disconnect for socket.io
      this.socket = null;
    }
    
    this.roomId = null;
    // this.isConnecting should be false if disconnect is called outside a connect sequence
    // If called *during* a connect sequence, the connect promise should handle isConnecting.
    // For a general disconnect, setting it to false is safe.
    this.isConnecting = false; 
    console.log('🔌 Disconnected from signaling server complete.');
  }

  sendSignal(data) {
    if (!this.socket?.connected) {
      console.warn('⚠️ Cannot send signal: not connected');
      return false;
    }

    try {
      const signalData = {
        ...data,
        roomId: this.roomId,
        fromUserId: auth.currentUser?.uid,
        timestamp: Date.now()
      };

      console.log(`📤 SENDING SIGNAL:`, {
        type: data.type || 'ice-candidate',
        roomId: this.roomId,
        fromUserId: signalData.fromUserId,
        hasOffer: !!data.offer,
        hasAnswer: !!data.answer,
        hasCandidate: !!data.candidate
      });

      this.socket.emit('signal', signalData);
      return true;
    } catch (error) {
      console.error('❌ Error sending signal:', error);
      return false;
    }
  }

  onSignal(callback) {
    if (typeof callback !== 'function') {
      console.error('❌ Signal callback must be a function');
      return;
    }
    this.onSignalCallback = callback;
    console.log('✅ Signal callback registered');
  }

  startHeartbeat() {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('heartbeat-ping');
        
        // Check if we've missed too many heartbeats
        if (this.lastHeartbeat && Date.now() - this.lastHeartbeat > 30000) {
          console.warn('⚠️ Missed heartbeats - reconnecting...');
          this.scheduleReconnect();
        }
      }
    }, 15000);

    this.socket.on('heartbeat-pong', () => {
      this.lastHeartbeat = Date.now();
    });
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) return;
    
    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect(this.roomId);
      } catch (error) {
        console.error('❌ Reconnection failed:', error);
      }
      this.reconnectTimeout = null;
    }, 5000);
  }

  isConnected() {
    return this.socket?.connected || false;
  }

  getConnectionState() {
    if (!this.socket) return 'disconnected';
    if (this.isConnecting) return 'connecting';
    return this.socket.connected ? 'connected' : 'disconnected';
  }

  getDebugInfo() {
    return {
      hasSocket: !!this.socket,
      isConnected: this.socket?.connected,
      socketId: this.socket?.id,
      roomId: this.roomId,
      transport: this.socket?.io?.engine?.transport?.name,
      isConnecting: this.isConnecting,
      hasCallback: !!this.onSignalCallback,
      lastHeartbeat: this.lastHeartbeat,
      connectionAttempts: this.connectionAttempts
    };
  }
}

export default new BulletproofSignalingService();
