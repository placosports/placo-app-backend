// routes/orderRoutes.js
const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authenticate");
const authorizeRole = require("../middleware/authorizeRole");
const mongoose = require("mongoose");
const crypto = require('crypto');
const razorpay = require("../middleware/razorpay");
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

// ✅ 2. Create Razorpay order (before placing actual order)
router.post("/create-razorpay-order", authenticate, async (req, res) => {
  try {
    const { amount, currency = "INR" } = req.body;
    const userId = req.rootUser._id;

    // Create Razorpay order
    const options = {
      amount: amount * 100, // Amount in paise
      currency: currency,
      receipt: `order_rcptid_${Date.now()}`,
      payment_capture: 1
    };

    const razorpayOrder = await razorpay.orders.create(options);

    res.json({
      success: true,
      order: razorpayOrder,
      key_id: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('Create Razorpay order error:', error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to create Razorpay order", 
      error: error.message 
    });
  }
});

// ✅ 3. Verify Razorpay payment
router.post("/verify-payment", authenticate, async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      order_data
    } = req.body;

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed"
      });
    }

    // Payment verified, now create the order with payment details
    const orderData = {
      ...order_data,
      razorpayDetails: {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        verified: true,
        payment_date: new Date()
      }
    };

    // Call the create order function
    const result = await createOrderWithPayment(req.rootUser._id, orderData);
    
    res.json({
      success: true,
      message: "Payment verified and order created",
      ...result
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ 
      success: false, 
      message: "Payment verification failed", 
      error: error.message 
    });
  }
});

// Helper function to create order after payment verification
async function createOrderWithPayment(userId, orderData) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { shippingAddress, paymentMethod, razorpayDetails } = orderData;
    
    // Get user's cart WITHOUT populate to avoid ObjectId casting errors
    const cart = await cartdb.findOne({ user: userId }).session(session);
    
    if (!cart || cart.items.length === 0) {
      await session.abortTransaction();
      throw new Error("Cart is empty");
    }
    
    // Get product details, check stock, and calculate totals
    let orderItems = [];
    let subtotal = 0;
    let stockUpdates = [];
    
    for (const cartItem of cart.items) {
      let product;
      
      // Check if the productId is a valid MongoDB ObjectId or custom string
      if (mongoose.Types.ObjectId.isValid(cartItem.productId)) {
        product = await productdb.findById(cartItem.productId).session(session);
      } else {
        product = await productdb.findOne({ productId: cartItem.productId }).session(session);
      }
      
      if (!product) {
        await session.abortTransaction();
        throw new Error(`Product ${cartItem.productId} not found`);
      }
      
      // Check if enough stock is available
      if (product.stockQuantity < cartItem.quantity) {
        await session.abortTransaction();
        throw new Error(`Insufficient stock for ${product.productName}. Available: ${product.stockQuantity}, Requested: ${cartItem.quantity}`);
      }
      
      // Reserve stock by reducing the quantity
      const newStockQuantity = product.stockQuantity - cartItem.quantity;
      await productdb.findByIdAndUpdate(
        product._id,
        { 
          stockQuantity: newStockQuantity,
          inStock: newStockQuantity > 0 
        },
        { session }
      );
      
      stockUpdates.push({
        productId: product._id,
        originalQuantity: product.stockQuantity,
        newQuantity: newStockQuantity,
        reservedQuantity: cartItem.quantity
      });
      
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
    
    // Create order with payment details
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
      paymentStatus: paymentMethod === "RAZORPAY" ? "PAID" : "PENDING",
      razorpayDetails: paymentMethod === "RAZORPAY" ? razorpayDetails : undefined,
      orderStatus: paymentMethod === "RAZORPAY" ? "CONFIRMED" : "PENDING",
      confirmedAt: paymentMethod === "RAZORPAY" ? new Date() : undefined
    });
    
    await newOrder.save({ session });
    
    // Clear cart after successful order
    await cartdb.findOneAndUpdate(
      { user: userId },
      { $set: { items: [] } },
      { session }
    );
    
    await session.commitTransaction();
    
    return {
      orderId: newOrder.orderId,
      order: newOrder,
      stockUpdates: stockUpdates.map(update => ({
        productId: update.productId,
        reservedQuantity: update.reservedQuantity,
        newAvailableStock: update.newQuantity
      }))
    };
    
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

// ✅ 4. Create order (COD orders)
router.post("/create", authenticate, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { shippingAddress, paymentMethod } = req.body;
    const userId = req.rootUser._id;
    
    // Only allow COD through this route
    if (paymentMethod !== "COD") {
      return res.status(400).json({ 
        message: "This route only supports COD orders. Use Razorpay flow for online payments." 
      });
    }
    
    const result = await createOrderWithPayment(userId, { shippingAddress, paymentMethod });
    
    res.status(201).json({
      message: "Order created successfully",
      ...result
    });
    
  } catch (error) {
    await session.abortTransaction();
    console.error('Create order error:', error);
    res.status(500).json({ message: "Failed to create order", error: error.message });
  } finally {
    session.endSession();
  }
});

// ✅ 5. Cancel order and restore stock
router.patch("/cancel/:orderId", authenticate, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.rootUser._id;
    
    const order = await orderdb.findOne({ orderId, user: userId }).session(session);
    
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Order not found" });
    }
    
    if (!["PENDING", "CONFIRMED"].includes(order.orderStatus)) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Order cannot be cancelled at this stage" });
    }
    
    // Handle refund for Razorpay orders
    if (order.paymentMethod === "RAZORPAY" && order.paymentStatus === "PAID") {
      // In a real implementation, you would initiate a refund here
      // For now, we'll just update the payment status
      order.paymentStatus = "REFUNDED";
    }
    
    // Restore stock for each item in the order
    const stockRestorations = [];
    for (const item of order.items) {
      let product = await productdb.findOne({ productId: item.productId }).session(session);
      
      if (product) {
        const restoredQuantity = product.stockQuantity + item.quantity;
        await productdb.findByIdAndUpdate(
          product._id,
          { 
            stockQuantity: restoredQuantity,
            inStock: true
          },
          { session }
        );
        
        stockRestorations.push({
          productId: item.productId,
          productName: item.productName,
          restoredQuantity: item.quantity,
          newAvailableStock: restoredQuantity
        });
      }
    }
    
    // Update order status
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
    
    await order.save({ session });
    await session.commitTransaction();
    
    res.json({ 
      message: "Order cancelled successfully", 
      order,
      stockRestorations
    });
    
  } catch (error) {
    await session.abortTransaction();
    console.error('Cancel order error:', error);
    res.status(500).json({ message: "Failed to cancel order", error: error.message });
  } finally {
    session.endSession();
  }
});

// ✅ 6. Get user's orders
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

// ✅ 7. Get specific order details
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

// ========== ADMIN ROUTES ==========

// ✅ 8. Get all orders (Admin)
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

// ✅ 9. Update order status (Admin)
router.patch("/admin/update-status/:orderId", authenticate, authorizeRole('admin'), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { orderId } = req.params;
    const { status, notes, trackingInfo } = req.body;
    const adminId = req.rootUser._id;
    
    const order = await orderdb.findOne({ orderId }).session(session);
    
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Order not found" });
    }
    
    // If changing to CANCELLED status, restore stock and handle refunds
    if (status === 'CANCELLED' && order.orderStatus !== 'CANCELLED') {
      // Handle refund for Razorpay orders
      if (order.paymentMethod === "RAZORPAY" && order.paymentStatus === "PAID") {
        order.paymentStatus = "REFUNDED";
      }
      
      // Restore stock
      for (const item of order.items) {
        let product = await productdb.findOne({ productId: item.productId }).session(session);
        
        if (product) {
          const restoredQuantity = product.stockQuantity + item.quantity;
          await productdb.findByIdAndUpdate(
            product._id,
            { 
              stockQuantity: restoredQuantity,
              inStock: true
            },
            { session }
          );
        }
      }
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
    
    await order.save({ session });
    await session.commitTransaction();
    
    res.json({ message: "Order status updated successfully", order });
    
  } catch (error) {
    await session.abortTransaction();
    console.error('Update order status error:', error);
    res.status(500).json({ message: "Failed to update order status", error: error.message });
  } finally {
    session.endSession();
  }
});

// ✅ 10. Razorpay Webhook (for payment status updates)
router.post("/razorpay-webhook", async (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    if (expectedSignature !== webhookSignature) {
      return res.status(400).json({ message: 'Invalid webhook signature' });
    }
    
    const { event, payload } = req.body;
    
    // Handle different webhook events
    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload.payment.entity);
        break;
      case 'payment.failed':
        await handlePaymentFailed(payload.payment.entity);
        break;
      case 'order.paid':
        await handleOrderPaid(payload.order.entity);
        break;
    }
    
    res.status(200).json({ status: 'ok' });
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

// Helper functions for webhook events
async function handlePaymentCaptured(payment) {
  try {
    const order = await orderdb.findOne({ 
      'razorpayDetails.razorpay_payment_id': payment.id 
    });
    
    if (order) {
      order.paymentStatus = 'PAID';
      order.razorpayDetails.amount_paid = payment.amount / 100; // Convert from paise
      order.razorpayDetails.payment_method = payment.method;
      
      order.statusHistory.push({
        status: 'PAYMENT_CAPTURED',
        timestamp: new Date(),
        notes: 'Payment captured via webhook'
      });
      
      await order.save();
    }
  } catch (error) {
    console.error('Handle payment captured error:', error);
  }
}

async function handlePaymentFailed(payment) {
  try {
    const order = await orderdb.findOne({ 
      'razorpayDetails.razorpay_payment_id': payment.id 
    });
    
    if (order) {
      order.paymentStatus = 'FAILED';
      order.orderStatus = 'CANCELLED';
      
      order.statusHistory.push({
        status: 'PAYMENT_FAILED',
        timestamp: new Date(),
        notes: 'Payment failed via webhook'
      });
      
      await order.save();
      
      // Restore stock when payment fails
      await restoreOrderStock(order);
    }
  } catch (error) {
    console.error('Handle payment failed error:', error);
  }
}

async function handleOrderPaid(razorpayOrder) {
  try {
    const order = await orderdb.findOne({ 
      'razorpayDetails.razorpay_order_id': razorpayOrder.id 
    });
    
    if (order) {
      order.orderStatus = 'CONFIRMED';
      order.confirmedAt = new Date();
      
      order.statusHistory.push({
        status: 'ORDER_CONFIRMED',
        timestamp: new Date(),
        notes: 'Order confirmed via webhook'
      });
      
      await order.save();
    }
  } catch (error) {
    console.error('Handle order paid error:', error);
  }
}

// Helper function to restore stock
async function restoreOrderStock(order) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    for (const item of order.items) {
      const product = await productdb.findOne({ productId: item.productId }).session(session);
      
      if (product) {
        const restoredQuantity = product.stockQuantity + item.quantity;
        await productdb.findByIdAndUpdate(
          product._id,
          { 
            stockQuantity: restoredQuantity,
            inStock: true
          },
          { session }
        );
      }
    }
    
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

module.exports = router;