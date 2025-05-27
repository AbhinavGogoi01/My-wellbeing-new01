// server/middleware/auth.js
const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  const serviceAccount = require('../../config/firebase-service-account.json');
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://my-well-being-19cdc.firebaseio.com'
  });
}

/**
 * Middleware to authenticate requests using Firebase Auth
 * Verifies the token in the Authorization header and adds user data to req.user
 */
const authenticate = async (req, res, next) => {
  let token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'No authentication token provided' 
    });
  }

  // Remove 'Bearer ' prefix if present
  if (token.startsWith('Bearer ')) {
    token = token.slice(7);
  }

  try {
    // Verify the token with Firebase
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;

    // Get full user data (optional)
    const userRecord = await admin.auth().getUser(decodedToken.uid);
    req.userData = {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      photoURL: userRecord.photoURL,
      emailVerified: userRecord.emailVerified
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired. Please sign in again.' 
      });
    }
    
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid authentication token' 
    });
  }
};

/**
 * Middleware to optionally authenticate requests
 * Works like authenticate, but continues the request even if the token is invalid or missing
 */
const optionalAuth = async (req, res, next) => {
  let token = req.headers.authorization;

  if (!token) {
    req.user = null;
    return next();
  }

  // Remove 'Bearer ' prefix if present
  if (token.startsWith('Bearer ')) {
    token = token.slice(7);
  }

  try {
    // Verify the token with Firebase
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;

    // Get full user data 
    const userRecord = await admin.auth().getUser(decodedToken.uid);
    req.userData = {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      photoURL: userRecord.photoURL,
      emailVerified: userRecord.emailVerified
    };
  } catch (error) {
    // Continue even if token is invalid
    console.error('Optional authentication error:', error);
    req.user = null;
  }

  next();
};

module.exports = { authenticate, optionalAuth };
