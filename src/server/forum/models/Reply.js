// server/models/Reply.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReplySchema = new Schema({
  content: {
    type: String,
    required: true,
    trim: true
  },
  topicId: {
    type: Schema.Types.ObjectId,
    ref: 'Topic',
    required: true,
    index: true
  },
  author: {
    uid: {
      type: String,
      required: true
    },
    username: {
      type: String,
      required: true
    },
    avatarUrl: String,
    joinDate: Date
  },
  likes: {
    type: Number,
    default: 0
  },
  likedBy: [{
    type: String // User UIDs who have liked this reply
  }],
  reports: [{
    userId: String,
    reason: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    resolved: {
      type: Boolean,
      default: false
    }
  }]
}, { 
  timestamps: true, // Adds createdAt and updatedAt
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Toggle like status for a user
ReplySchema.methods.toggleLike = function(userId) {
  const index = this.likedBy.indexOf(userId);
  
  if (index === -1) {
    // User hasn't liked this reply yet, add like
    this.likedBy.push(userId);
    this.likes += 1;
  } else {
    // User already liked this reply, remove like
    this.likedBy.splice(index, 1);
    this.likes -= 1;
  }
  
  return this.save();
};

// Check if a user has liked this reply
ReplySchema.methods.isLikedByUser = function(userId) {
  return this.likedBy.includes(userId);
};

// Report a reply
ReplySchema.methods.report = function(userId, reason) {
  // Check if the user has already reported this reply
  const existingReport = this.reports.find(report => report.userId === userId);
  
  if (existingReport) {
    // Update the existing report
    existingReport.reason = reason;
    existingReport.createdAt = Date.now();
    existingReport.resolved = false;
  } else {
    // Add a new report
    this.reports.push({
      userId,
      reason,
      createdAt: Date.now(),
      resolved: false
    });
  }
  
  return this.save();
};

module.exports = mongoose.model('Reply', ReplySchema);