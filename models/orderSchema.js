// models/orderSchema.js
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    default: () => `ORD${Math.floor(100000 + Math.random() * 900000)}`
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true
  },
  
  // Order Items - Store complete product snapshot
  items: [{
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    productCategory: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    images: [{
      url: { type: String },
      public_id: { type: String }
    }],
    colourOption: { type: String },
    subtotal: { type: Number, required: true } // price * quantity
  }],

  // Order Summary
  orderSummary: {
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    shipping: { type: Number, required: true },
    total: { type: Number, required: true },
    currency: { type: String, default: "INR" }
  },

  // Shipping Address
  shippingAddress: {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: "India" }
  },

  // Payment Details - Updated for Razorpay
  paymentMethod: {
    type: String,
    enum: ["COD", "RAZORPAY"],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
    default: "PENDING"
  },
  
  // Razorpay Payment Details
  razorpayDetails: {
    razorpay_order_id: { type: String },
    razorpay_payment_id: { type: String },
    razorpay_signature: { type: String },
    amount_paid: { type: Number },
    payment_method: { type: String }, // card, upi, netbanking, wallet
    verified: { type: Boolean, default: false },
    payment_date: { type: Date }
  },

  // Order Status
  orderStatus: {
    type: String,
    enum: ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
    default: "PENDING"
  },

  // Status Timeline
  statusHistory: [{
    status: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" },
    notes: { type: String }
  }],

  // Tracking Information
  trackingInfo: {
    trackingNumber: { type: String },
    courierService: { type: String },
    estimatedDelivery: { type: Date }
  },

  // Admin Notes
  adminNotes: { type: String },
  
  // Timestamps
  orderDate: { type: Date, default: Date.now },
  confirmedAt: { type: Date },
  shippedAt: { type: Date },
  deliveredAt: { type: Date },
  cancelledAt: { type: Date },
  
  // Cancellation
  cancellationReason: { type: String },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "users" }
});

// Add initial status to history when order is created
orderSchema.pre('save', function(next) {
  if (this.isNew) {
    this.statusHistory.push({
      status: this.orderStatus,
      timestamp: new Date(),
      notes: "Order placed"
    });
  }
  next();
});

const orderdb = mongoose.model("orders", orderSchema);
module.exports = orderdb;