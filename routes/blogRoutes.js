const express = require("express");
const Blog = require("../models/blogSchema");
const authenticate = require("../middleware/authenticate");
const authorizeRole = require("../middleware/authorizeRole");
const upload = require("../middleware/multer");

const router = express.Router();

router.post(
  "/",
  authenticate,
  authorizeRole("admin"),
  upload.array("images", 5), // allow up to 5 images
  async (req, res) => {
    try {
      const { title, content, type, layoutStyle, layoutMeta } = req.body;
      
      // Parse content - expecting JSON string with paragraph structure
      let parsedContent;
      try {
        parsedContent = JSON.parse(content);
      } catch (error) {
        return res.status(400).json({ 
          error: "Invalid content format. Expected JSON array of paragraphs." 
        });
      }
      
      // Validate paragraph count (minimum 2, maximum 5)
      if (!Array.isArray(parsedContent) || parsedContent.length < 2) {
        return res.status(400).json({ 
          error: "Minimum 2 paragraphs required" 
        });
      }
      
      if (parsedContent.length > 5) {
        return res.status(400).json({ 
          error: "Maximum 5 paragraphs allowed" 
        });
      }
      
      // Parse layoutMeta if provided
      let parsedLayoutMeta = {};
      if (layoutMeta) {
        try {
          parsedLayoutMeta = typeof layoutMeta === 'string' ? JSON.parse(layoutMeta) : layoutMeta;
        } catch (error) {
          return res.status(400).json({ 
            error: "Invalid layoutMeta format. Expected JSON object." 
          });
        }
      }
      
      // Validate layoutStyle
      const validLayoutStyles = ["newspaper", "giveaway", "hero-flow", "magazine"];
      if (layoutStyle && !validLayoutStyles.includes(layoutStyle)) {
        return res.status(400).json({ 
          error: "Invalid layout style. Must be one of: " + validLayoutStyles.join(", ") 
        });
      }
      
      // Process uploaded images
      const images = req.files ? req.files.map(file => ({
        url: file.path,
        public_id: file.filename
      })) : [];
      
      // Validate that image indices are valid
      const maxImageIndex = Math.max(...parsedContent
        .filter(p => p.imageIndex !== null && p.imageIndex !== undefined)
        .map(p => p.imageIndex), -1);
      
      if (maxImageIndex >= images.length) {
        return res.status(400).json({ 
          error: `Invalid image index. You referenced image ${maxImageIndex} but only ${images.length} images were uploaded.`
        });
      }

      // Validate hero image index if provided
      if (parsedLayoutMeta.heroImageIndex !== undefined && parsedLayoutMeta.heroImageIndex >= images.length) {
        return res.status(400).json({ 
          error: `Invalid hero image index. You specified image ${parsedLayoutMeta.heroImageIndex} but only ${images.length} images were uploaded.`
        });
      }

      const blog = new Blog({
        title,
        content: parsedContent,
        type,
        layoutStyle: layoutStyle || "magazine", // default to magazine layout
        layoutMeta: parsedLayoutMeta,
        author: req.rootUser._id,
        images: images,
      });

      await blog.save();
      res.status(201).json({ message: "Blog created successfully", blog });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error while creating blog" });
    }
  }
);

/**
 * Get All Blogs (Public)
 * GET /blogs
 */
router.get("/", async (req, res) => {
  try {
    const blogs = await Blog.find()
      .populate("author", "name email role")
      .sort({ createdAt: -1 });

    res.json(blogs);
  } catch (error) {
    console.error("Error in GET /blogs:", error);
    res.status(500).json({ error: "Server error while fetching blogs" });
  }
});

/**
 * Get Single Blog (Public)
 * GET /blogs/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate(
      "author",
      "name email role"
    );
    if (!blog) return res.status(404).json({ error: "Blog not found" });

    res.json(blog);
  } catch (error) {
    res.status(500).json({ error: "Server error while fetching blog" });
  }
});

/**
 * Update Blog (Admin only)
 * PUT /blogs/:id
 */
router.put(
  "/:id",
  authenticate,
  authorizeRole("admin"),
  upload.array("images", 5), // Changed from single to array
  async (req, res) => {
    try {
      const { title, content, type, layoutStyle, layoutMeta } = req.body;
      
      // Parse content
      let parsedContent;
      try {
        parsedContent = JSON.parse(content);
      } catch (error) {
        return res.status(400).json({ 
          error: "Invalid content format. Expected JSON array of paragraphs." 
        });
      }
      
      // Validate paragraph count
      if (!Array.isArray(parsedContent) || parsedContent.length < 2 || parsedContent.length > 5) {
        return res.status(400).json({ 
          error: "Blog must have between 2 and 5 paragraphs" 
        });
      }

      // Parse layoutMeta if provided
      let parsedLayoutMeta = {};
      if (layoutMeta) {
        try {
          parsedLayoutMeta = typeof layoutMeta === 'string' ? JSON.parse(layoutMeta) : layoutMeta;
        } catch (error) {
          return res.status(400).json({ 
            error: "Invalid layoutMeta format. Expected JSON object." 
          });
        }
      }

      // Validate layoutStyle
      const validLayoutStyles = ["newspaper", "giveaway", "hero-flow", "magazine"];
      if (layoutStyle && !validLayoutStyles.includes(layoutStyle)) {
        return res.status(400).json({ 
          error: "Invalid layout style. Must be one of: " + validLayoutStyles.join(", ") 
        });
      }

      const updateData = {
        title,
        content: parsedContent,
        type,
        layoutStyle: layoutStyle || "magazine",
        layoutMeta: parsedLayoutMeta,
        updatedAt: Date.now(),
      };

      // If new images are uploaded, replace all images
      if (req.files && req.files.length > 0) {
        updateData.images = req.files.map(file => ({
          url: file.path,
          public_id: file.filename
        }));
      }

      const blog = await Blog.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
      });

      if (!blog) return res.status(404).json({ error: "Blog not found" });

      res.json({ message: "Blog updated successfully", blog });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Server error while updating blog" });
    }
  }
);

/**
 * Delete Blog (Admin only)
 * DELETE /blogs/:id
 */
router.delete("/:id", authenticate, authorizeRole("admin"), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ error: "Blog not found" });

    // Delete all images from Cloudinary
    if (blog.images && blog.images.length > 0) {
      const cloudinary = require("../config/cloudinary");
      for (const image of blog.images) {
        if (image.public_id) {
          await cloudinary.uploader.destroy(image.public_id);
        }
      }
    }

    await blog.deleteOne();
    res.json({ message: "Blog deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error while deleting blog" });
  }
});

module.exports = router;