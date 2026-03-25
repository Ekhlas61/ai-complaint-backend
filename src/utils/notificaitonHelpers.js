const Notification = require('../models/Notification');

const createNotification = async (io, userId, type, title, message, data = null) => {
  try {
    const notification = await Notification.create({
      user: userId,
      type,
      title,
      message,
      data,
    });
    io.to(`user:${userId}`).emit('new_notification', notification);
    return notification;
  } catch (err) {
    console.error('Notification error:', err);
    return null;
  }
};

module.exports = createNotification;