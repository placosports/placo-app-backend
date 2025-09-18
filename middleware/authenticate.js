const jwt = require("jsonwebtoken");
const userdb = require("../models/userSchema");
const keysecret = process.env.SECRET_KEY;

const authenticate = async (req, res, next) => {
  try {
    // Get token from cookie first
    const token = req.cookies.usercookie;
    
    // If no cookie token, try Authorization header (for API requests)
    const authHeader = req.headers.authorization;
    
    if (!token && !authHeader) {
      return res.status(401).json({ status: 401, message: "No authentication token provided" });
    }
    
    // Use token from cookie or extract from Bearer token in header
    const finalToken = token || (authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) // Remove 'Bearer ' prefix
      : authHeader);

    // Verify token
    const verifyToken = jwt.verify(finalToken, keysecret);
    
    // Find user by id
    const rootUser = await userdb.findOne({ _id: verifyToken._id });
    
    if (!rootUser) {
      throw new Error("User not found");
    }
    
    // Check if token exists in user tokens array
    // (This assumes you're storing used tokens in the user document)
    const tokenExists = rootUser.tokens.some(t => t.token === finalToken);
    
    if (!tokenExists) {
      return res.status(401).json({ status: 401, message: "Token not valid" });
    }
    
    // Add user data to request
    req.token = finalToken;
    req.rootUser = rootUser;
    req.userId = rootUser._id;
    
    next();
  } catch (error) {
    res.status(401).json({ status: 401, message: "Unauthorized: Invalid token" });
    console.log(error);
  }
};

module.exports = authenticate;