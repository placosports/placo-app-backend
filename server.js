// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { connectUserDB } = require('./db/conn');
const router = require('./routes/router');
const productRoutes = require("./routes/productRoutes");
const cartRoutes = require("./routes/cartRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const blogRoutes = require("./routes/blogRoutes");
const orderRoutes = require("./routes/orderRoutes");
const pincodeRoutes = require("./routes/pincodeRoutes");
const app = express();
const port = process.env.PORT || 8010;

// Middleware
app.use(express.json());
app.use(cookieParser());

// CORS for frontend - Allow multiple origins
const allowedOrigins = [
  'http://localhost:3000',
  'https://placo-app.vercel.app',
  'https://www.theplaco.com',
].filter(Boolean); // Remove any undefined/null values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

const initializeApp = async () => {
  try {
    // Connect to all databases
    const userDbConnection = await connectUserDB();
    
    
    
    

    app.use(router); 
    app.use("/api", productRoutes);
    app.use("/api", cartRoutes);
    app.use("/api", wishlistRoutes);
    app.use("/api/blogs", blogRoutes);  // Changed from "/blogs" to "/api/blogs"
    app.use('/api/orders', orderRoutes);
    app.use('/api/pincodes', pincodeRoutes);
    app.use("/api", require("./routes/serviceRoutes"));
    
    
    // Start server
    app.listen(port, () => {
      console.log(`✅ Server running on port: ${port}`);
      console.log(`🌐 Allowed CORS origins:`, allowedOrigins);
      console.log(`📊 Database Status:`);
      
    });
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    process.exit(1);
  }
};

initializeApp();