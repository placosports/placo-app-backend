// routes/orderRoutes.js
const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authenticate");
const authorizeRole = require("../middleware/authorizeRole");
const upload = require("../middleware/multer");
const mongoose = require("mongoose");
const orderdb = require("../models/orderSchema");
const cartdb = require("../models/cartSchema");
const productdb = require("../models/productSchema");
const pincodedb = require("../models/pincodeSchema");

// ✅ 1. Check COD availability for pincode
router.get("/check-cod/:pincode", async (req, res) => {
  try {
    const { pincode } = req.params;
    
    const pincodeData = await pincodedb.findOne({ 
      pincode: pincode.trim(), 
      active: true 
    });
    
    if (!pincodeData) {
      return res.json({
        available: false,
        message: "Delivery not available to this pincode"
      });
    }
    
    res.json({
      available: pincodeData.codAvailable,
      deliveryCharge: pincodeData.deliveryCharge,
      estimatedDeliveryDays: pincodeData.estimatedDeliveryDays,
      area: pincodeData.area,
      city: pincodeData.city,
      state: pincodeData.state
    });
    
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ 2. Create order from cart
// ✅ 2. Create order from cart - CORRECTED VERSION
router.post("/create", authenticate, async (req, res) => {
  try {
    const { shippingAddress, paymentMethod } = req.body;
    const userId = req.rootUser._id;
    
    // Get user's cart WITHOUT populate to avoid ObjectId casting errors
    const cart = await cartdb.findOne({ user: userId });
    
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }
    
    // Get product details and calculate totals
    let orderItems = [];
    let subtotal = 0;
    
    for (const cartItem of cart.items) {
      let product;
      
      // Check if the productId is a valid MongoDB ObjectId or custom string
      if (mongoose.Types.ObjectId.isValid(cartItem.productId)) {
        // Query by MongoDB _id
        product = await productdb.findById(cartItem.productId);
      } else {
        // Query by custom productId field
        product = await productdb.findOne({ productId: cartItem.productId });
      }
      
      if (!product || !product.inStock) {
        return res.status(400).json({ 
          message: `Product ${product?.productName || cartItem.productId} is not available` 
        });
      }
      
      const itemSubtotal = product.price * cartItem.quantity;
      subtotal += itemSubtotal;
      
      orderItems.push({
        productId: product.productId,
        productName: product.productName,
        productCategory: product.productCategory,
        price: product.price,
        quantity: cartItem.quantity,
        images: product.images,
        colourOption: product.colourOptions?.[0] || null,
        subtotal: itemSubtotal
      });
    }
    
    // Calculate order summary
    const tax = subtotal * 0.08;
    let shipping = subtotal > 750 ? 0 : 99;
    
    // Check for additional delivery charges based on pincode
    if (shippingAddress.pincode) {
      const pincodeData = await pincodedb.findOne({ 
        pincode: shippingAddress.pincode.trim(), 
        active: true 
      });
      
      if (pincodeData && pincodeData.deliveryCharge > shipping) {
        shipping = pincodeData.deliveryCharge;
      }
    }
    
    const total = subtotal + tax + shipping;
    
    // Create order
    const newOrder = new orderdb({
      user: userId,
      items: orderItems,
      orderSummary: {
        subtotal,
        tax,
        shipping,
        total
      },
      shippingAddress,
      paymentMethod,
      paymentStatus: paymentMethod === "COD" ? "PENDING" : "PENDING"
    });
    
    await newOrder.save();
    
    // Clear cart after successful order
    await cartdb.findOneAndUpdate(
      { user: userId },
      { $set: { items: [] } }
    );
    
    res.status(201).json({
      message: "Order created successfully",
      orderId: newOrder.orderId,
      order: newOrder
    });
    
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ message: "Failed to create order", error: error.message });
  }
});

// ✅ 3. Upload payment proof
router.post("/payment-proof/:orderId", authenticate, upload.single('paymentProof'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.rootUser._id;
    
    if (!req.file) {
      return res.status(400).json({ message: "Payment proof image is required" });
    }
    
    const order = await orderdb.findOne({ orderId, user: userId });
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    if (order.paymentMethod !== "PAID_TO_SELLER") {
      return res.status(400).json({ message: "Payment proof only allowed for 'Paid to Seller' orders" });
    }
    
    // Update order with payment proof
    order.paymentProof = {
      url: req.file.path,
      public_id: req.file.filename,
      uploadedAt: new Date()
    };
    order.paymentStatus = "PAID";
    
    // Add to status history
    order.statusHistory.push({
      status: "PAYMENT_UPLOADED",
      timestamp: new Date(),
      updatedBy: userId,
      notes: "Payment proof uploaded by customer"
    });
    
    await order.save();
    
    res.json({
      message: "Payment proof uploaded successfully",
      paymentProof: order.paymentProof
    });
    
  } catch (error) {
    console.error('Upload payment proof error:', error);
    res.status(500).json({ message: "Failed to upload payment proof", error: error.message });
  }
});

// ✅ 4. Get user's orders
router.get("/my-orders", authenticate, async (req, res) => {
  try {
    const userId = req.rootUser._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const orders = await orderdb.find({ user: userId })
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit);
    
    const totalOrders = await orderdb.countDocuments({ user: userId });
    
    res.json({
      orders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      totalOrders
    });
    
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({ message: "Failed to fetch orders", error: error.message });
  }
});

// ✅ 5. Get specific order details
router.get("/details/:orderId", authenticate, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.rootUser._id;
    
    const order = await orderdb.findOne({ orderId, user: userId });
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    res.json({ order });
    
  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({ message: "Failed to fetch order details", error: error.message });
  }
});

// ✅ 6. Cancel order (user)
router.patch("/cancel/:orderId", authenticate, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.rootUser._id;
    
    const order = await orderdb.findOne({ orderId, user: userId });
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    if (!["PENDING", "CONFIRMED"].includes(order.orderStatus)) {
      return res.status(400).json({ message: "Order cannot be cancelled at this stage" });
    }
    
    order.orderStatus = "CANCELLED";
    order.cancelledAt = new Date();
    order.cancellationReason = reason || "Cancelled by customer";
    order.cancelledBy = userId;
    
    order.statusHistory.push({
      status: "CANCELLED",
      timestamp: new Date(),
      updatedBy: userId,
      notes: order.cancellationReason
    });
    
    await order.save();
    
    res.json({ message: "Order cancelled successfully", order });
    
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ message: "Failed to cancel order", error: error.message });
  }
});

// ========== ADMIN ROUTES ==========

// ✅ 7. Get all orders (Admin)
router.get("/admin/all", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const search = req.query.search;
    
    let filter = {};
    
    if (status && status !== 'ALL') {
      filter.orderStatus = status;
    }
    
    if (search) {
      filter.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'shippingAddress.fullName': { $regex: search, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: search, $options: 'i' } }
      ];
    }
    
    const orders = await orderdb.find(filter)
      .populate('user', 'fname email')
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit);
    
    const totalOrders = await orderdb.countDocuments(filter);
    
    // Get order statistics
    const stats = await orderdb.aggregate([
      {
        $group: {
          _id: '$orderStatus',
          count: { $sum: 1 },
          totalValue: { $sum: '$orderSummary.total' }
        }
      }
    ]);
    
    res.json({
      orders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit),
      totalOrders,
      stats
    });
    
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({ message: "Failed to fetch orders", error: error.message });
  }
});

// ✅ 8. Update order status (Admin)
router.patch("/admin/update-status/:orderId", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes, trackingInfo } = req.body;
    const adminId = req.rootUser._id;
    
    const order = await orderdb.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    // Update order status
    order.orderStatus = status;
    
    // Update relevant timestamps
    switch (status) {
      case 'CONFIRMED':
        order.confirmedAt = new Date();
        break;
      case 'SHIPPED':
        order.shippedAt = new Date();
        break;
      case 'DELIVERED':
        order.deliveredAt = new Date();
        break;
      case 'CANCELLED':
        order.cancelledAt = new Date();
        order.cancelledBy = adminId;
        break;
    }
    
    // Update tracking info if provided
    if (trackingInfo) {
      order.trackingInfo = { ...order.trackingInfo, ...trackingInfo };
    }
    
    // Add to status history
    order.statusHistory.push({
      status,
      timestamp: new Date(),
      updatedBy: adminId,
      notes: notes || `Status updated to ${status} by admin`
    });
    
    await order.save();
    
    res.json({ message: "Order status updated successfully", order });
    
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: "Failed to update order status", error: error.message });
  }
});

module.exports = router;