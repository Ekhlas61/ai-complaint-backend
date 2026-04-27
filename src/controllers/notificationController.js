const Notification = require('../models/Notification');

// Helper function for relative time
function getRelativeTime(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return new Date(date).toLocaleDateString();
}

// Get current user's notifications
exports.getNotifications = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));
    
    // Format notifications with relative time
    const formattedNotifications = notifications.map(notif => {
      const notificationObj = notif.toObject();
      notificationObj.createdAtRelative = getRelativeTime(notif.createdAt);
      delete notificationObj.__v;
      return notificationObj;
    });
    
    res.json({
      success: true,
      count: notifications.length,
      notifications: formattedNotifications
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Mark a single notification as read
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    notification.read = true;
    await notification.save();
    
    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (err) {
    console.error('Mark as read error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user._id, read: false },
      { read: true }
    );
    
    res.json({
      success: true,
      message: `${result.modifiedCount} notification${result.modifiedCount !== 1 ? 's' : ''} marked as read`
    });
  } catch (err) {
    console.error('Mark all as read error:', err);
    res.status(500).json({ message: err.message });
  }
};