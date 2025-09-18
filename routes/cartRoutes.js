const express = require("express");
const router = express.Router();
const cartdb = require("../models/cartSchema");
const productdb = require("../models/productSchema");
const authenticate = require("../middleware/authenticate");

// Add item to cart
router.post("/cart/add", authenticate, async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    // Check if product exists by productId
    const product = await productdb.findOne({ productId });
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Check if item already exists in cart
    let cart = await cartdb.findOne({ user: req.userId });
    
    if (cart) {
      // Check if item already exists
      const existingItem = cart.items.find(item => item.productId === productId);
      
      if (existingItem) {
        // Update quantity
        existingItem.quantity += quantity || 1;
      } else {
        // Add new item
        cart.items.push({ productId, quantity: quantity || 1 });
      }
      
      await cart.save();
    } else {
      // Create new cart
      cart = new cartdb({
        user: req.userId,
        items: [{ productId, quantity: quantity || 1 }]
      });
      await cart.save();
    }

    // Return populated items
    const populatedItems = await Promise.all(
      cart.items.map(async (item) => {
        const product = await productdb.findOne({ productId: item.productId });
        return {
          product,
          quantity: item.quantity
        };
      })
    );

    res.status(200).json({ 
      message: "Item added to cart", 
      items: populatedItems 
    });
  } catch (err) {
    console.error("Add to cart error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update quantity
router.patch("/cart/update", authenticate, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    
    if (!productId || quantity < 1) {
      return res.status(400).json({ error: "Invalid productId or quantity" });
    }

    const cart = await cartdb.findOneAndUpdate(
      { user: req.userId, "items.productId": productId },
      { $set: { "items.$.quantity": quantity } },
      { new: true }
    );

    if (!cart) {
      return res.status(404).json({ error: "Cart or item not found" });
    }

    // Return populated items
    const populatedItems = await Promise.all(
      cart.items.map(async (item) => {
        const product = await productdb.findOne({ productId: item.productId });
        return {
          product,
          quantity: item.quantity
        };
      })
    );

    res.status(200).json({ 
      message: "Quantity updated", 
      items: populatedItems 
    });
  } catch (err) {
    console.error("Update quantity error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Remove item
router.delete("/cart/remove/:productId", authenticate, async (req, res) => {
  try {
    const cart = await cartdb.findOneAndUpdate(
      { user: req.userId },
      { $pull: { items: { productId: req.params.productId } } },
      { new: true }
    );

    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    // Return populated items
    const populatedItems = await Promise.all(
      cart.items.map(async (item) => {
        const product = await productdb.findOne({ productId: item.productId });
        return {
          product,
          quantity: item.quantity
        };
      })
    );

    res.status(200).json({ 
      message: "Item removed", 
items: populatedItems 
    });
  } catch (err) {
    console.error("Remove item error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Clear entire cart - THIS IS THE MISSING ENDPOINT
router.delete("/cart/clear", authenticate, async (req, res) => {
  try {
    const cart = await cartdb.findOneAndUpdate(
      { user: req.userId },
      { $set: { items: [] } },
      { new: true, upsert: true }
    );

    res.status(200).json({ 
      message: "Cart cleared successfully", 
      items: []
    });
  } catch (err) {
    console.error("Clear cart error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get user cart
router.get("/cart", authenticate, async (req, res) => {
  try {
    const cart = await cartdb.findOne({ user: req.userId });

    if (!cart) {
      return res.status(200).json({ items: [] });
    }

    // Fetch product details for each item
    const populatedItems = await Promise.all(
      cart.items.map(async (item) => {
        const product = await productdb.findOne({ productId: item.productId });
        return {
          product,
          quantity: item.quantity
        };
      })
    );

    res.status(200).json({ 
      items: populatedItems,
      cartId: cart._id,
      updatedAt: cart.updatedAt
    });
  } catch (err) {
    console.error("Get cart error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;