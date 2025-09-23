const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  content: [
    {
      text: { type: String, required: false },
      imageIndex: { type: Number, required: false }
    }
  ],
  type: {
    type: String,
    enum: ["giveaway", "info", "news", "training", "other"],
    default: "info",
  },
  // NEW FIELD: Layout style determines visual presentation
  layoutStyle: {
    type: String,
    enum: ["newspaper", "giveaway", "hero-flow", "magazine"],
    default: "magazine"
  },
  // NEW FIELD: Layout-specific configuration
  layoutMeta: {
    heroImageIndex: { 
      type: Number, 
      default: 0 
    },
    accentColor: { 
      type: String, 
      default: "#007bff" 
    },
    subtitle: { 
      type: String, 
      default: "" 
    },
    callToAction: {
      text: { 
        type: String, 
        default: "" 
      },
      link: { 
        type: String, 
        default: "" 
      }
    }
  },
  // Keep the old single image field for backward compatibility
  image: {
    url: { type: String },
    public_id: { type: String },
  },
  // Images array field
  images: [
    {
      url: { type: String },
      public_id: { type: String },
    }
  ],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

const blogdb = mongoose.model("Blog", blogSchema);
module.exports = blogdb;