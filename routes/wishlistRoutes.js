const express = require("express");
const router = express.Router();
const wishlistdb = require("../models/wishlistSchema");
const productdb = require("../models/productSchema");
const authenticate = require("../middleware/authenticate");

// Test route to check if API is working
router.get("/api/test", (req, res) => {
  res.json({
    success: true,
    message: "API is working!",
    timestamp: new Date().toISOString()
  });
});

// Test route to check authentication
router.get("/api/test-auth", authenticate, (req, res) => {
  res.json({
    success: true,
    message: "Authentication is working!",
    user: {
      id: req.userId,
      email: req.rootUser.email
    },
    timestamp: new Date().toISOString()
  });
});

// Enhanced Get wishlist with detailed logging
router.get("/api/wishlist", authenticate, async (req, res) => {
  console.log("=== WISHLIST REQUEST START ===");
  console.log("User ID:", req.userId);
  console.log("Request headers:", req.headers);
  
  try {
    console.log("Finding wishlist for user:", req.userId);
    const wishlist = await wishlistdb.findOne({ user: req.userId });
    console.log("Wishlist found:", wishlist);

    if (!wishlist || !wishlist.products.length) {
      console.log("No wishlist or empty wishlist, returning empty array");
      return res.status(200).json({ 
        success: true,
        products: [],
        message: "Wishlist is empty"
      });
    }

    console.log("Product IDs in wishlist:", wishlist.products);
    
    // Manually fetch full product details
    const products = await productdb.find({ 
      productId: { $in: wishlist.products } 
    });
    
    console.log("Products found:", products.length);
    console.log("First product:", products[0]);

    const response = { 
      success: true,
      products,
      count: products.length
    };
    
    console.log("Sending response:", response);
    console.log("=== WISHLIST REQUEST END ===");
    
    res.status(200).json(response);
  } catch (err) {
    console.error("=== WISHLIST ERROR ===");
    console.error("Error details:", err);
    console.error("Error stack:", err.stack);
    console.error("=== WISHLIST ERROR END ===");
    
    res.status(500).json({ 
      success: false,
      error: "Internal server error",
      message: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Add to wishlist
router.post("/api/wishlist/add", authenticate, async (req, res) => {
  console.log("=== ADD TO WISHLIST START ===");
  console.log("Request body:", req.body);
  console.log("User ID:", req.userId);
  
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ 
        success: false,
        error: "Product ID is required" 
      });
    }

    // Check if product exists
    console.log("Looking for product:", productId);
    const product = await productdb.findOne({ productId });
    console.log("Product found:", product);
    
    if (!product) {
      return res.status(404).json({ 
        success: false,
        error: "Product not found" 
      });
    }

    const wishlist = await wishlistdb.findOneAndUpdate(
      { user: req.userId },
      { 
        $setOnInsert: { user: req.userId }, 
        $addToSet: { products: productId } 
      },
      { upsert: true, new: true }
    );

    console.log("Updated wishlist:", wishlist);

    // Get full product details for response
    const products = await productdb.find({ 
      productId: { $in: wishlist.products } 
    });

    const response = { 
      success: true,
      message: "Product added to wishlist", 
      wishlist: { 
        ...wishlist.toObject(), 
        products 
      } 
    };
    
    console.log("=== ADD TO WISHLIST END ===");
    res.status(200).json(response);
  } catch (err) {
    console.error("=== ADD TO WISHLIST ERROR ===");
    console.error("Error details:", err);
    console.error("=== ADD TO WISHLIST ERROR END ===");
    
    res.status(500).json({ 
      success: false,
      error: "Internal server error",
      message: err.message 
    });
  }
});

// Remove from wishlist
router.delete("/api/wishlist/remove/:productId", authenticate, async (req, res) => {
  console.log("=== REMOVE FROM WISHLIST START ===");
  console.log("Product ID to remove:", req.params.productId);
  console.log("User ID:", req.userId);
  
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({ 
        success: false,
        error: "Product ID is required" 
      });
    }

    const wishlist = await wishlistdb.findOneAndUpdate(
      { user: req.userId },
      { $pull: { products: productId } },
      { new: true }
    );

    console.log("Updated wishlist after removal:", wishlist);

    if (!wishlist) {
      return res.status(404).json({ 
        success: false,
        error: "Wishlist not found" 
      });
    }

    // Get full product details for response
    const products = await productdb.find({ 
      productId: { $in: wishlist.products } 
    });

    const response = { 
      success: true,
      message: "Product removed from wishlist", 
      wishlist: { 
        ...wishlist.toObject(), 
        products 
      } 
    };
    
    console.log("=== REMOVE FROM WISHLIST END ===");
    res.status(200).json(response);
  } catch (err) {
    console.error("=== REMOVE FROM WISHLIST ERROR ===");
    console.error("Error details:", err);
    console.error("=== REMOVE FROM WISHLIST ERROR END ===");
    
    res.status(500).json({ 
      success: false,
      error: "Internal server error",
      message: err.message 
    });
  }
});

// Clear entire wishlist
router.delete("/wishlist/clear", authenticate, async (req, res) => {
  try {
    const wishlist = await wishlistdb.findOneAndUpdate(
      { user: req.userId },
      { $set: { products: [] } },
      { new: true }
    );

    res.status(200).json({ 
      success: true,
      message: "Wishlist cleared successfully", 
      wishlist: { 
        ...wishlist.toObject(), 
        products: [] 
      } 
    });
  } catch (err) {
    console.error("Clear wishlist error:", err);
    res.status(500).json({ 
      success: false,
      error: "Internal server error",
      message: err.message 
    });
  }
});

module.exports = router;