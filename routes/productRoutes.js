const express = require("express");
const router = express.Router();
const productdb = require("../models/productSchema");
const authenticate = require("../middleware/authenticate");
const authorizeRole = require("../middleware/authorizeRole");
const upload = require("../middleware/multer"); // Multer + Cloudinary setup
const cloudinary = require("../config/cloudinary");

// ---------------- Admin Routes ---------------- //

// Create a new product with images (Admin only)
router.post(
  "/products",
  authenticate,
  authorizeRole("admin"),
  upload.array("images", 5), // max 5 images
  async (req, res) => {
    try {
      const images = req.files.map(file => ({
        url: file.path,
        public_id: file.filename
      }));

      // Ensure stockQuantity is set properly
      const productData = {
        ...req.body,
        images,
        stockQuantity: parseInt(req.body.stockQuantity) || 0,
        lowStockThreshold: parseInt(req.body.lowStockThreshold) || 5
      };

      const newProduct = new productdb(productData);
      const savedProduct = await newProduct.save();
      res.status(201).json(savedProduct);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Update a product (Admin only)
router.put(
  "/products/:id",
  authenticate,
  authorizeRole("admin"),
  upload.array("images", 5),
  async (req, res) => {
    try {
      const product = await productdb.findById(req.params.id);
      if (!product) return res.status(404).json({ error: "Product not found" });

      // If new images uploaded → delete old ones & replace
      if (req.files.length > 0) {
        // delete old images from cloudinary
        for (let img of product.images) {
          await cloudinary.uploader.destroy(img.public_id);
        }

        product.images = req.files.map(file => ({
          url: file.path,
          public_id: file.filename
        }));
      }

      // Update other fields including stock quantity
      const updateData = { ...req.body };
      if (updateData.stockQuantity !== undefined) {
        updateData.stockQuantity = parseInt(updateData.stockQuantity) || 0;
      }
      if (updateData.lowStockThreshold !== undefined) {
        updateData.lowStockThreshold = parseInt(updateData.lowStockThreshold) || 5;
      }

      Object.assign(product, updateData);

      const updatedProduct = await product.save();
      res.status(200).json(updatedProduct);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Update stock quantity specifically (Admin only)
router.patch(
  "/products/:id/stock",
  authenticate,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const { stockQuantity, operation } = req.body; // operation: 'set', 'add', 'subtract'
      const product = await productdb.findById(req.params.id);
      
      if (!product) return res.status(404).json({ error: "Product not found" });

      let newStock;
      switch (operation) {
        case 'add':
          newStock = product.stockQuantity + parseInt(stockQuantity);
          break;
        case 'subtract':
          newStock = Math.max(0, product.stockQuantity - parseInt(stockQuantity));
          break;
        case 'set':
        default:
          newStock = parseInt(stockQuantity) || 0;
          break;
      }

      product.stockQuantity = newStock;
      const updatedProduct = await product.save();
      
      res.status(200).json({
        message: "Stock updated successfully",
        product: updatedProduct,
        previousStock: operation === 'set' ? null : product.stockQuantity,
        newStock: newStock
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Get low stock products (Admin only)
router.get(
  "/products/low-stock",
  authenticate,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const products = await productdb.find({
        $expr: { $lte: ["$stockQuantity", "$lowStockThreshold"] },
        stockQuantity: { $gte: 0 }
      }).sort({ stockQuantity: 1 });
      
      res.status(200).json({
        message: `Found ${products.length} products with low stock`,
        products
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Delete a product (Admin only)
router.delete(
  "/products/:id",
  authenticate,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const product = await productdb.findById(req.params.id);
      if (!product) return res.status(404).json({ error: "Product not found" });

      // Delete each image from Cloudinary
      for (let img of product.images) {
        await cloudinary.uploader.destroy(img.public_id);
      }

      await product.deleteOne();
      res.status(200).json({ message: "Product deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------------- Public Routes ---------------- //

// Get all products (any authenticated user)
router.get("/products", async (req, res) => {
  try {
    const { inStock, category, minPrice, maxPrice } = req.query;
    let filter = {};
    
    // Filter by stock availability
    if (inStock === 'true') {
      filter.stockQuantity = { $gt: 0 };
    } else if (inStock === 'false') {
      filter.stockQuantity = 0;
    }
    
    // Filter by category
    if (category) {
      filter.productCategory = { $regex: category, $options: 'i' };
    }
    
    // Filter by price range
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }
    
    const products = await productdb.find(filter);
    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single product by ID (any authenticated user)
router.get("/products/:id", async (req, res) => {
  try {
    const product = await productdb.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.status(200).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check product availability for specific quantity
router.get("/products/:id/availability/:quantity", async (req, res) => {
  try {
    const { id, quantity } = req.params;
    const product = await productdb.findById(id);
    
    if (!product) return res.status(404).json({ error: "Product not found" });
    
    const requestedQuantity = parseInt(quantity);
    const available = product.stockQuantity >= requestedQuantity;
    
    res.status(200).json({
      available,
      requestedQuantity,
      availableStock: product.stockQuantity,
      productName: product.productName,
      maxQuantity: product.stockQuantity
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Review Routes ---------------- //

// Add a review to a product (any authenticated user)
router.post("/products/:id/review", authenticate, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const product = await productdb.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });

    // Add review
    const review = {
      user: req.rootUser.fname,
      rating,
      comment,
      createdAt: new Date()
    };
    product.reviews.push(review);
    await product.save();

    res.status(201).json({ message: "Review added successfully", review });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Optional: Admin can delete reviews
router.delete(
  "/products/:productId/review/:reviewId",
  authenticate,
  authorizeRole("admin"),
  async (req, res) => {
    try {
      const product = await productdb.findById(req.params.productId);
      if (!product) return res.status(404).json({ error: "Product not found" });

      // Filter out the review
      product.reviews = product.reviews.filter(
        r => r._id.toString() !== req.params.reviewId
      );
      await product.save();
      res.status(200).json({ message: "Review deleted successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;