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

      const newProduct = new productdb({
        ...req.body,
        images
      });

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

      // update other fields
      Object.assign(product, req.body);

      const updatedProduct = await product.save();
      res.status(200).json(updatedProduct);
    } catch (err) {
      res.status(400).json({ error: err.message });
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
router.get("/products",  async (req, res) => {
  try {
    const products = await productdb.find();
    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single product by ID (any authenticated user)
router.get("/products/:id",  async (req, res) => {
  try {
    const product = await productdb.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.status(200).json(product);
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
