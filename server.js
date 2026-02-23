require('dotenv').config();
const express = require('express');
const connectDB = require('./src/config/db');

const authRoutes = require('./src/routes/authRoutes');
const reportRoutes = require('./src/routes/reportRoutes');



const app = express();

// Middleware
app.use(express.json());

// Connect Database
connectDB();

// Routes 
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);

// Test route
app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
