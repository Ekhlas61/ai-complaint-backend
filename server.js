require('dotenv').config();
const express = require('express');
const connectDB = require('./src/config/db');

const authRoutes = require('./src/routes/authRoutes');
const reportRoutes = require('./src/routes/reportRoutes');


const app = express();

const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

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
