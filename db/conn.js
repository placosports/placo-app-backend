require('dotenv').config();
const mongoose = require('mongoose');

// Connect to user management database
const connectUserDB = async () => {
  try {
    const userDbUri = process.env.USER_DB_URI;
    await mongoose.connect(userDbUri);
    console.log("User management DB connected successfully");
    return mongoose.connection;
  } catch (error) {
    console.error("User management DB connection error:", error);
    process.exit(1); // Exit if we can't connect to the critical user DB
  }
};





module.exports = { connectUserDB };
