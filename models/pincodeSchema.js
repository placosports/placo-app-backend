// models/pincodeSchema.js
const mongoose = require("mongoose");

const pincodeSchema = new mongoose.Schema({
  pincode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: /^[1-9][0-9]{5}$/ // Indian pincode validation
  },
  area: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  codAvailable: {
    type: Boolean,
    default: true
  },
  deliveryCharge: {
    type: Number,
    default: 0,
    min: 0
  },
  estimatedDeliveryDays: {
    type: Number,
    default: 3,
    min: 1
  },
  active: {
    type: Boolean,
    default: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

pincodeSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const pincodedb = mongoose.model("pincodes", pincodeSchema);
module.exports = pincodedb;