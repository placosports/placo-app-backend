// Fix 3: Updated Blog Schema (add this to your blogSchema.js file)
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
  // Keep the old single image field for backward compatibility
  image: {
    url: { type: String },
    public_id: { type: String },
  },
  // Add the new images array field to match your API
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