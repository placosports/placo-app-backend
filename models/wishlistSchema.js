// models/wishlistSchema.js
const mongoose = require("mongoose");

const wishlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, unique: true },
  products: [{ type: String, ref: "products" }], // store productId values
  updatedAt: { type: Date, default: Date.now }
});

wishlistSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

const wishlistdb = mongoose.model("wishlists", wishlistSchema);
module.exports = wishlistdb;
