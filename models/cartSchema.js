// models/cartSchema.js
const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true, unique: true },
  items: [
    {
      productId: { type: String, required: true }, // using your custom productId
      quantity: { type: Number, default: 1, min: 1 }
    }
  ],
  updatedAt: { type: Date, default: Date.now }
});

cartSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

const cartdb = mongoose.model("carts", cartSchema);
module.exports = cartdb;
