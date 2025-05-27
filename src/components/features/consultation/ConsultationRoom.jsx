import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { auth, db, storage } from '../../Auth/firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Peer from 'peerjs';
import io from 'socket.io-client';
import './ConsultationRoom.css';
import './file-upload.css';

const ConsultationRoom = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const consultationType = new URLSearchParams(location.search).get('type') || 'video';
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Initializing...');
  const [error, setError] = useState('');
  const [consultation, setConsultation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isChatMode, setIsChatMode] = useState(consultationType === 'chat');
  const [connectionState, setConnectionState] = useState('new');
  const [isConnected, setIsConnected] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [hasVideo, setHasVideo] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileToUpload, setFileToUpload] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const peerRef = useRef(null);
  const socketRef = useRef(null);
  const peersRef = useRef({});
  const isInitializing = useRef(false);
  // const pendingCandidates = useRef([]);
  // const hasRemoteDescription = useRef(false);
  const streamCleanupRef = useRef(null);
  const initTimeoutRef = useRef(null);
  // const offerTimeoutRef = useRef(null);
  const isCleaningUp = useRef(false);
  const fileInputRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Enhanced camera access with better error handling
  const requestUserMedia = useCallback(async () => {
    try {
      setConnectionState('requesting-media');
      console.log('🎥 Requesting user media...');
      
      const constraintOptions = [
        // Try HD quality first
        {
          video: { 
            width: { ideal: 1280 }, 
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: { 
            echoCancellation: true, 
            noiseSuppression: true,
            autoGainControl: true
          }
        },
        // Fallback to basic quality
        {
          video: { 
            width: { ideal: 640 }, 
            height: { ideal: 480 },
            frameRate: { ideal: 24 }
          },
          audio: { 
            echoCancellation: true, 
            noiseSuppression: true
          }
        },
        // Minimum quality
        {
          video: { 
            width: 320, 
            height: 240,
            frameRate: 15
          },
          audio: true
        },
        {
          video: true,
          audio: false
        },
        // Audio only as last resort
        {
          video: false,
          audio: true
        }
      ];

      let lastError = null;
      let stream = null;
      
      for (let i = 0; i < constraintOptions.length; i++) {
        try {
          console.log(`🔄 Trying media constraint option ${i + 1}:`, constraintOptions[i]);
          
          stream = await navigator.mediaDevices.getUserMedia(constraintOptions[i]);
          
          console.log('✅ Got media stream:', {
            id: stream.id,
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length,
            active: stream.active
          });
          
          break;
        } catch (err) {
          console.warn(`⚠️ Failed with constraint option ${i + 1}:`, err.message);
          lastError = err;
          
          // Break early if permission is denied
          if (err.name === 'NotAllowedError') {
            throw new Error('Camera/microphone access denied by user');
          }
        }
      }
      
      if (!stream) {
        throw lastError || new Error('Failed to access media devices');
      }
      
      // Set up local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      setHasVideo(stream.getVideoTracks().length > 0);
      setHasAudio(stream.getAudioTracks().length > 0);
      setConnectionState('media-ready');
      console.log('✅ Media access granted');
      
      return stream;
    } catch (error) {
      console.error('❌ Media access denied:', error);
      setConnectionState('media-denied');
      setError(`Camera access denied: ${error.message}`);
      throw error;
    }
  }, []);

  // FIXED: Simplified and more reliable video setup
  const setupVideoElement = useCallback((videoElement, stream, isLocal = false) => {
    if (!videoElement || !stream) {
      console.warn('⚠️ Cannot setup video: missing element or stream');
      return false;
    }

    console.log(`🎬 Setting up ${isLocal ? 'local' : 'remote'} video element`);
    
    try {
      // Clear existing source
      videoElement.srcObject = null;
      videoElement.pause();
      
      // Set properties
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.muted = isLocal;
      videoElement.controls = false;
      
      // Apply styles directly
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.objectFit = 'cover';
      videoElement.style.background = '#000';
      
      if (isLocal) {
        videoElement.style.transform = 'scaleX(-1)';
      }
      
      // Set stream
      videoElement.srcObject = stream;
      
      // Force play attempt
      const playVideo = async () => {
        try {
          await videoElement.play();
          console.log(`✅ ${isLocal ? 'Local' : 'Remote'} video playing`);
          return true;
        } catch (e) {
          console.warn(`⚠️ ${isLocal ? 'Local' : 'Remote'} video autoplay failed:`, e.message);
          
          // For local video, it's often not critical due to autoplay policies
          if (isLocal) {
            console.log('📺 Local video stream set (autoplay blocked but video should show)');
            return true;
          }
          
          return false;
        }
      };
      
      // Immediate play attempt
      playVideo();
      
      return true;
      
    } catch (error) {
      console.error(`❌ Error setting up ${isLocal ? 'local' : 'remote'} video:`, error);
      return false;
    }
  }, []);

  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up...');
    isCleaningUp.current = true;
    
    // Clear timeouts
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
    }
    
    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach(track => {
        track.stop();
        console.log(`🎥 Stopped ${track.kind} track`);
      });
    }
    
    // Clean up video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    // Close PeerJS connections
    if (peerRef.current) {
      console.log('🔌 Closing PeerJS connection');
      peerRef.current.destroy();
      peerRef.current = null;
    }
    
    // Close all peer connections
    Object.values(peersRef.current).forEach(call => {
      if (call) {
        console.log('📞 Closing call');
        call.close();
      }
    });
    peersRef.current = {};
    
    // Disconnect Socket.IO
    if (socketRef.current) {
      console.log('🔌 Disconnecting Socket.IO');
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    // Reset state
    setLocalStream(null);
    setRemoteStream(null);
    setIsConnected(false);
    setConnectionState('new');
    
    isCleaningUp.current = false;
    console.log('✅ Cleanup complete');
  }, [localStream]);

  const handleConnectionRecovery = useCallback(async () => {
    console.log('🔄 Attempting connection recovery...');
    
    try {
      // Clean up existing connection
      cleanup();
      
      // Short delay before reconnecting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!isCleaningUp.current) {
        console.log('🔄 Reinitializing WebRTC...');
        if (consultation) {
          await initializeWebRTC(consultation);
        }
      }
    } catch (err) {
      console.error('❌ Recovery failed:', err);
      setError('Failed to reconnect. Please refresh the page.');
    }
  }, [cleanup, consultation]);

  const retryCamera = useCallback(async () => {
    console.log('🔄 Retrying camera access...');
    setCameraError('');
    setError('');
    setLoading(true);
    
    // Clean up first
    cleanup();
    
    // Wait a bit then retry
    setTimeout(() => {
      if (consultation) {
        initializeWebRTC(consultation);
      }
    }, 1000);
  }, [cleanup, consultation]);

  const initializeWebRTC = useCallback(async (consultationData) => {
    console.log('🚀 Initializing WebRTC with PeerJS...');
    
    if (isInitializing.current) {
      console.log('⏳ Already initializing...');
      return;
    }
    
    isInitializing.current = true;
    setLoading(true);
    setLoadingStatus('Initializing video call...');
    
    setLoadingStatus('Checking server availability...');
    try {
      console.log('🔍 Checking if signaling server is reachable at http://localhost:3001/health');
      const response = await fetch('http://localhost:3001/health');
      if (!response.ok) {
        throw new Error('Signaling server health check failed');
      }
      const serverInfo = await response.json();
      console.log('✅ Signaling server is reachable:', serverInfo);
    } catch (healthError) {
      console.error('❌ Signaling server health check failed:', healthError);
      setError('Signaling server is not running. Please start with: node server.js');
      setLoading(false);
      isInitializing.current = false;
      return;
    }
    
    try {
      // Request camera/mic access
      setLoadingStatus('Requesting camera access...');
      const stream = await requestUserMedia();
      
      if (isCleaningUp.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      
      // Set up local video
      setLocalStream(stream);
      if (localVideoRef.current) {
        setupVideoElement(localVideoRef.current, stream, true);
      }
      
      // Connect to signaling server
      setLoadingStatus('Connecting to server...');
      console.log('🔐 Current user auth state:', auth.currentUser?.uid ? 'Authenticated' : 'Not authenticated');
      console.log('📡 Attempting WebSocket connection to port 3001...');
      
      try {
        const networkInfo = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (networkInfo) {
          console.log('🌐 Network info:', {
            type: networkInfo.type,
            effectiveType: networkInfo.effectiveType,
            downlink: networkInfo.downlink,
            rtt: networkInfo.rtt,
            saveData: networkInfo.saveData
          });
        }
      } catch (e) {
        console.log('Network info not available');
      }
      
      // Create PeerJS instance with debug logging
      setLoadingStatus('Creating PeerJS connection...');
      const myPeer = new Peer(undefined, {
        debug: 3, // Log everything for debugging
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        }
      });
      peerRef.current = myPeer;
      
      // Connect to Socket.IO signaling server
      const socket = io('http://localhost:3001', {
        transports: ['polling', 'websocket'], // Match server's transport order
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });
      socketRef.current = socket;
      
      // Set up socket event listeners
      socket.on('connect', () => {
        console.log('✅ Socket.IO connected successfully');
      });
      
      socket.on('connect_error', (error) => {
        console.error('❌ Socket.IO connection error:', error);
        setError(`Failed to connect to signaling server: ${error.message}. 
          Troubleshooting steps:
          1. Ensure server is running on port 3001
          2. Check firewall settings for WebSocket connections
          3. Try refreshing the page
          
          Switching to chat-only mode...`);
        
        setIsChatMode(true);
        setLoadingStatus('Chat-only mode activated');
      });
      
      // Handle incoming calls
      myPeer.on('call', (call) => {
        console.log('📞 Incoming call received');
        call.answer(stream);
        setConnectionState('connected');
        setIsConnected(true);
        
        call.on('stream', (userVideoStream) => {
          console.log('📹 Remote stream received');
          if (remoteVideoRef.current) {
            setupVideoElement(remoteVideoRef.current, userVideoStream, false);
          }
          setRemoteStream(userVideoStream);
          setHasRemoteVideo(userVideoStream.getVideoTracks().length > 0);
        });
        
        call.on('close', () => {
          console.log('📞 Call closed');
          setConnectionState('closed');
          setIsConnected(false);
        });
        
        call.on('error', (error) => {
          console.error('❌ Call error:', error);
          setError(`Call error: ${error.message}`);
        });
      });
      
      // Handle user connections
      socket.on('user-connected', (userId) => {
        console.log('👤 User connected:', userId);
        
        // If we're the doctor, initiate the call
        const isDoctor = auth.currentUser?.uid === consultationData.doctorId;
        if (isDoctor) {
          setLoadingStatus('Initiating call...');
          
          setTimeout(() => {
            console.log('📞 Initiating call to:', userId);
            const call = myPeer.call(userId, stream);
            peersRef.current[userId] = call;
            
            call.on('stream', (userVideoStream) => {
              console.log('📹 Remote stream received');
              if (remoteVideoRef.current) {
                setupVideoElement(remoteVideoRef.current, userVideoStream, false);
              }
              setRemoteStream(userVideoStream);
              setHasRemoteVideo(userVideoStream.getVideoTracks().length > 0);
              setConnectionState('connected');
              setIsConnected(true);
            });
            
            call.on('close', () => {
              console.log('📞 Call closed');
              setConnectionState('closed');
              setIsConnected(false);
              delete peersRef.current[userId];
            });
            
            call.on('error', (error) => {
              console.error('❌ Call error:', error);
              setError(`Call error: ${error.message}`);
            });
          }, 1000);
        } else {
          setLoadingStatus('Waiting for doctor to call...');
        }
      });
      
      // Handle user disconnections
      socket.on('user-disconnected', (userId) => {
        console.log('👤 User disconnected:', userId);
        if (peersRef.current[userId]) {
          peersRef.current[userId].close();
          delete peersRef.current[userId];
        }
        setConnectionState('closed');
        setIsConnected(false);
      });
      
      myPeer.on('open', (id) => {
        console.log('🔑 PeerJS ID received:', id);
        socket.emit('join-room', roomId, id);
        setLoadingStatus('Joined room, waiting for connection...');
      });
      
      myPeer.on('error', (error) => {
        console.error('❌ PeerJS error:', error);
        setError(`PeerJS error: ${error.message}. Switching to chat-only mode.`);
        setIsChatMode(true);
        setLoadingStatus('Chat-only mode activated');
      });
      
      // Set connection timeout
      const initTimeoutRef = setTimeout(() => {
        if (!isConnected && !isCleaningUp.current) {
          console.log('⏰ Connection timeout');
          setLoading(false);
          setLoadingStatus('');
          setError('Connection is taking longer than expected. Chat is available below.');
        }
      }, 45000);
      
    } catch (err) {
      console.error('❌ WebRTC initialization error:', err);
      setError(`Video consultation failed: ${err.message}. Switching to chat-only mode.`);
      setCameraError(err.message);
      setIsChatMode(true);
      setLoadingStatus('Chat-only mode activated');
      setLoading(false);
    } finally {
      isInitializing.current = false;
      setLoading(false);
    }
  }, [roomId, requestUserMedia, setupVideoElement, isConnected]);

  // Effect for fetching initial data and messages
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setLoadingStatus('Loading consultation details...');

    const messagesQueryFn = (consultationId) => query(
      collection(db, 'consultationMessages'),
      where('consultationId', '==', consultationId),
      orderBy('timestamp', 'asc')
    );

    let unsubscribeMessages = null;

    const loadInitialData = async () => {
      if (!roomId) {
        if (isMounted) {
          setError('Room ID is missing.');
          setLoading(false);
        }
        return;
      }

      try {
        const consultationRef = doc(db, 'consultations', roomId);
        const consultationSnap = await getDoc(consultationRef);

        if (!consultationSnap.exists()) {
          if (isMounted) {
            setError('Consultation not found');
            setLoading(false); // Stop loading if consultation not found
          }
          return; // Exit if no consultation
        }

        const newConsultationData = consultationSnap.data();
        if (isMounted) {
          setConsultation(newConsultationData);
          console.log('✅ Loaded consultation data:', newConsultationData);

          if (unsubscribeMessages) {
            unsubscribeMessages();
          }
          unsubscribeMessages = onSnapshot(messagesQueryFn(roomId), (snapshot) => {
            if (isMounted) {
              const newMessages = snapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() }));
              setMessages(newMessages);
              setTimeout(scrollToBottom, 100);
            }
          });
        }
      } catch (err) {
        console.error('❌ Error fetching consultation:', err);
        if (isMounted) {
          setError('Failed to load consultation: ' + err.message);
          setLoading(false);
        }
      }
      // setLoading(false) will be handled by the WebRTC init effect or chat mode logic
    };

    loadInitialData();

    return () => {
      console.log('🧹 Cleaning up data fetching effect for roomId:', roomId);
      isMounted = false;
      if (unsubscribeMessages) {
        console.log('Unsubscribing messages listener');
        unsubscribeMessages();
      }
    };
  }, [roomId, scrollToBottom]); // Only depends on roomId and stable scrollToBottom

  // Effect for initializing WebRTC or handling chat mode
  useEffect(() => {
    console.log('[WebRTC Init Effect] Triggered. Deps:', { hasConsultation: !!consultation, isChatMode, isInitializing: isInitializing.current, isCleaningUp: isCleaningUp.current });

    if (isChatMode) {
      console.log('[WebRTC Init Effect] Chat mode. Setting loading false.');
      setLoading(false);
      setLoadingStatus('');
      return; // Done for chat mode
    }

    if (!consultation) {
      console.log('[WebRTC Init Effect] No consultation data yet. Waiting...');
      // setLoading(true); // Ensure loading is true if we are waiting for consultation for WebRTC
      // setLoadingStatus('Loading consultation details...');
      return; // Wait for consultation data
    }

    // At this point, consultation is available and it's not chat mode.
    if (isInitializing.current) {
      console.log('[WebRTC Init Effect] Already initializing WebRTC.');
      return;
    }

    if (isCleaningUp.current) {
      console.log('[WebRTC Init Effect] Currently cleaning up. Aborting WebRTC init.');
      return;
    }

    // Conditions met to initialize WebRTC
    console.log('[WebRTC Init Effect] Conditions met. Scheduling initializeWebRTC.');
    const initTimer = setTimeout(() => {
      // Final check before actual call
      if (consultation && !isChatMode && !isInitializing.current && !isCleaningUp.current) {
        console.log('[WebRTC Init Effect] Calling initializeWebRTC inside setTimeout');
        initializeWebRTC(consultation);
      } else {
        console.warn('[WebRTC Init Effect] Conditions changed before setTimeout callback. Not initializing WebRTC.', { hasConsultation: !!consultation, isChatMode, isInitializing: isInitializing.current, isCleaningUp: isCleaningUp.current });
      }
    }, 100); // Minimal delay to allow DOM to settle and break sync chain

    return () => {
      console.log('[WebRTC Init Effect] Clearing WebRTC initialization timeout.');
      clearTimeout(initTimer);
    };
  }, [consultation, isChatMode, initializeWebRTC]); // initializeWebRTC is a dependency here

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      setError(`File ${file.name} is too large. Maximum size is 5MB.`);
      return;
    }
    
    setFileToUpload(file);
  };

  const uploadFile = async () => {
    if (!fileToUpload || !roomId) return;
    
    setUploadingFile(true);
    setUploadProgress(0);
    
    try {
      // Create a reference to the file location
      const fileRef = ref(storage, `consultations/${roomId}/chat/${Date.now()}_${fileToUpload.name}`);
      
      await uploadBytes(fileRef, fileToUpload);
      setUploadProgress(50);
      
      const downloadURL = await getDownloadURL(fileRef);
      setUploadProgress(100);
      
      const isImage = fileToUpload.type.startsWith('image/');
      const isPdf = fileToUpload.type === 'application/pdf';
      
      await addDoc(collection(db, 'consultationMessages'), {
        consultationId: roomId,
        text: isImage ? '📷 Image' : isPdf ? '📄 PDF Document' : '📎 File',
        senderId: auth.currentUser?.uid,
        senderName: auth.currentUser?.displayName || 'Anonymous',
        timestamp: serverTimestamp(),
        fileUrl: downloadURL,
        fileName: fileToUpload.name,
        fileType: fileToUpload.type,
        isFile: true,
        isImage,
        isPdf
      });
      
      setFileToUpload(null);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Failed to upload file: ' + err.message);
    } finally {
      setUploadingFile(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() && !fileToUpload) return;
    if (!roomId) return;

    try {
      if (fileToUpload) {
        await uploadFile();
      }
      
      if (newMessage.trim()) {
        await addDoc(collection(db, 'consultationMessages'), {
          consultationId: roomId,
          text: newMessage.trim(),
          senderId: auth.currentUser?.uid,
          senderName: auth.currentUser?.displayName || 'Anonymous',
          timestamp: serverTimestamp()
        });
      }
      
      setNewMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message: ' + err.message);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  };

  return (
    <div className={`consultation-room ${isChatMode ? 'chat-mode' : 'video-mode'}`}>
      {error && (
        <div className="error-banner">
          {error}
          {(cameraError || error.includes('camera') || error.includes('Camera')) && (
            <button 
              onClick={retryCamera}
              style={{ 
                marginLeft: '10px', 
                padding: '5px 10px', 
                background: 'rgba(255,255,255,0.2)', 
                border: 'none', 
                borderRadius: '4px', 
                color: 'white', 
                cursor: 'pointer' 
              }}
            >
              Retry
            </button>
          )}
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      {loading ? (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>{loadingStatus}</p>
          <small>Connection state: {connectionState}</small>
        </div>
      ) : (
        <>
          {!isChatMode && (
            <div className="video-container">
              <div className="video-grid">
                <div className="video-wrapper local">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="local-video"
                    style={{ 
                      transform: 'scaleX(-1)',
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      background: '#000'
                    }}
                  />
                  <div className="video-label">You</div>
                  {!localStream && (
                    <div className="waiting-overlay">
                      <p>Camera not available</p>
                      <small>{cameraError || 'Camera access failed'}</small>
                      <button 
                        onClick={retryCamera}
                        style={{ 
                          marginTop: '10px',
                          padding: '8px 16px',
                          background: '#007bff',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Retry Camera
                      </button>
                    </div>
                  )}
                  {localStream && (
                    <div className="video-controls">
                      <button
                        onClick={toggleVideo}
                        className={`control-button ${!isVideoEnabled ? 'disabled' : ''}`}
                        title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
                      >
                        {isVideoEnabled ? '🎥' : '🚫'}
                      </button>
                      <button
                        onClick={toggleAudio}
                        className={`control-button ${!isAudioEnabled ? 'disabled' : ''}`}
                        title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
                      >
                        {isAudioEnabled ? '🎤' : '🔇'}
                      </button>
                    </div>
                  )}
                  <div className="connection-indicator">
                    <span className={`status ${connectionState}`}>
                      {isConnected ? 'Connected' : connectionState}
                    </span>
                  </div>
                </div>
                
                <div className="video-wrapper remote">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="remote-video"
                    style={{ 
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      background: '#000'
                    }}
                  />
                  <div className="video-label">
                    {remoteStream ? 'Other Participant' : 'Waiting...'}
                  </div>
                  {!remoteStream && (
                    <div className="waiting-overlay">
                      <p>
                        {connectionState === 'connected' 
                          ? 'Waiting for other participant...' 
                          : 'Connecting...'}
                      </p>
                      <small>Status: {connectionState}</small>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Same device warning */}
              <div style={{ 
                position: 'absolute', 
                top: '80px', 
                left: '20px', 
                background: 'rgba(255, 193, 7, 0.9)', 
                color: '#000', 
                padding: '10px 15px', 
                borderRadius: '5px', 
                fontSize: '12px',
                maxWidth: '300px',
                zIndex: 100
              }}>
                <strong>⚠️ Testing Mode</strong><br />
                For best results, test on separate devices or use one tab at a time.
              </div>
            </div>
          )}

          <div className={`chat-container ${isChatMode ? 'full-height' : ''}`}>
            <div className="messages-container">
              {messages.length === 0 && (
                <div style={{ 
                  textAlign: 'center', 
                  color: '#666', 
                  padding: '20px',
                  fontStyle: 'italic'
                }}>
                  No messages yet. Start the conversation!
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${
                    message.senderId === auth.currentUser?.uid ? 'sent' : 'received'
                  }`}
                >
                  <div className="message-content">
                    {message.isFile ? (
                      <>
                        {message.isImage ? (
                          <div className="image-preview">
                            <a href={message.fileUrl} target="_blank" rel="noopener noreferrer">
                              <img src={message.fileUrl} alt={message.fileName} style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px' }} />
                            </a>
                          </div>
                        ) : message.isPdf ? (
                          <div className="pdf-preview">
                            <a href={message.fileUrl} target="_blank" rel="noopener noreferrer" className="file-link">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '24px' }}>📄</span>
                                <span>{message.fileName}</span>
                              </div>
                            </a>
                          </div>
                        ) : (
                          <div className="file-preview">
                            <a href={message.fileUrl} target="_blank" rel="noopener noreferrer" className="file-link">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '24px' }}>📎</span>
                                <span>{message.fileName}</span>
                              </div>
                            </a>
                          </div>
                        )}
                      </>
                    ) : (
                      <p>{message.text}</p>
                    )}
                    <span className="timestamp">
                      {message.timestamp?.toDate?.()?.toLocaleTimeString() || 'Sending...'}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="message-input">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
              />
              {uploadingFile && (
                <div className="upload-progress">
                  <div 
                    className="progress-bar" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                  <span>{uploadProgress}%</span>
                </div>
              )}
              <div className="message-actions">
                <label htmlFor="file-upload" className="file-upload-label">
                  📎
                  <input
                    id="file-upload"
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    accept="image/*,.pdf,.doc,.docx"
                  />
                </label>
                {fileToUpload && (
                  <div className="selected-file">
                    <span>{fileToUpload.name}</span>
                    <button 
                      onClick={() => setFileToUpload(null)}
                      className="remove-file"
                    >
                      ×
                    </button>
                  </div>
                )}
                <button 
                  onClick={sendMessage} 
                  disabled={!newMessage.trim() && !fileToUpload}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ConsultationRoom;
