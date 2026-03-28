require('dotenv').config();
const express = require('express');
const connectDB = require('./src/config/db');
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./src/models/User');

// Importing routes
const authRoutes = require('./src/routes/authRoutes');
const complaintRoutes = require('./src/routes/complaintRoutes');
const departmentRoutes = require('./src/routes/departmentRoutes');
const userRoutes = require('./src/routes/userRoutes');
const debugRoutes = require('./src/routes/debugRoutes');
const analyticsRoutes = require('./src/routes/analyticsRoutes');
const organizationRoutes = require('./src/routes/organizationRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');

const app = express();

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
});

// Load Swagger document
const swaggerDocument = YAML.load("./src/docs/swagger.yaml");

// Swagger
if (process.env.NODE_ENV === "production") {
  swaggerDocument.servers = [
    {
      url: "https://ai-complaint-backend-7xc5.onrender.com/api",
      description: "Production Server",
    },
  ];
}

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('_id role');
    if (!user) return next(new Error('User not found'));
    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user._id}`);
  socket.join(`user:${socket.user._id}`); // room for private notifications
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user._id}`);
  });
});

// Make io available in controllers
app.set('io', io);

// CORS configuration – allow local Swagger UI and frontend during development
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:5000',     
  'https://ai-complaint-backend-7xc5.onrender.com',
  'http://localhost:50510', // Flutter development
  'http://localhost:3000',  // Common React development
  'http://localhost:8080',  // Common Vue/Angular development           
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin 
    if (!origin) return callback(null, true);
    // In development, allow any origin 
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    // In production, allow specific origins and localhost for development
    if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost:')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Body parser middleware
app.use(express.json());

// Validate essential environment variables
const requiredEnv = ['MONGO_URI', 'JWT_SECRET'];
for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    console.error(`FATAL ERROR: ${envVar} is not defined.`);
    process.exit(1);
  }
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/notifications', notificationRoutes);

// Test route
app.get('/', (req, res) => {
  res.send('API is running...');
});

// ===== GLOBAL ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
});

const PORT = process.env.PORT || 5000;

// Start server only after DB connection succeeds
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to database, exiting...', err);
    process.exit(1);
  });