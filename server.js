require('dotenv').config();
const express = require('express');
const connectDB = require('./src/config/db');
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const cors = require('cors');

// Import routes (after app is created, but can be before)
const authRoutes = require('./src/routes/authRoutes');
const complaintRoutes = require('./src/routes/complaintRoutes');
const departmentRoutes = require('./src/routes/departmentRoutes');
const userRoutes = require('./src/routes/userRoutes');
const debugRoutes = require('./src/routes/debugRoutes');

const app = express();

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

// CORS middleware – place after app creation, before other middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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

// Test route
app.get('/', (req, res) => {
  res.send('API is running...');
});

// ===== GLOBAL ERROR HANDLER =====
// Must be placed after all routes and middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);

  // Default error status and message
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
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to database, exiting...', err);
    process.exit(1);
  });