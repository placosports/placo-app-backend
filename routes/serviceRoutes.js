const express = require("express");
const router = express.Router();
const { Service, ServiceBooking } = require("../models/serviceSchema");
const authenticate = require("../middleware/authenticate");
const authorizeRole = require("../middleware/authorizeRole");
const upload = require("../middleware/multer");

// Get all active services
router.get("/services", async (req, res) => {
  try {
    const services = await Service.find({ isActive: true }).sort({ createdAt: -1 });
    res.status(200).json({
      status: 200,
      services
    });
  } catch (error) {
    console.error("Get services error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch services",
      error: error.message
    });
  }
});

// Get single service by ID
router.get("/services/:id", async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({
        status: 404,
        message: "Service not found"
      });
    }
    
    res.status(200).json({
      status: 200,
      service
    });
  } catch (error) {
    console.error("Get service error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch service",
      error: error.message
    });
  }
});

// Create service booking
router.post("/bookings", authenticate, async (req, res) => {
  try {
    const {
      serviceId,
      customerDetails,
      racquetDetails,
      pickupAddress,
      paymentMethod,
      notes
    } = req.body;

    // Validate service exists
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        status: 404,
        message: "Service not found"
      });
    }

    // Create booking
    const booking = new ServiceBooking({
      user: req.userId,
      service: serviceId,
      customerDetails,
      racquetDetails,
      pickupAddress,
      paymentDetails: {
        method: paymentMethod,
        amount: service.price,
        status: paymentMethod === "PAID_TO_SELLER" ? "PENDING" : "PENDING"
      },
      notes: {
        customer: notes || ""
      },
      timeline: [{
        status: "BOOKING_CONFIRMED",
        timestamp: new Date(),
        description: "Your service booking has been confirmed"
      }]
    });

    await booking.save();

    // Populate service details for response
    await booking.populate('service');

    res.status(201).json({
      status: 201,
      message: "Service booking created successfully",
      booking
    });

  } catch (error) {
    console.error("Create booking error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to create service booking",
      error: error.message
    });
  }
});

// Upload payment proof for service booking
router.post("/bookings/:bookingId/payment-proof", authenticate, upload.single('paymentProof'), async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const booking = await ServiceBooking.findOne({ 
      bookingId, 
      user: req.userId 
    });

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: 400,
        message: "Payment proof image is required"
      });
    }

    // Update payment proof
    booking.paymentDetails.paymentProof = {
      url: req.file.path,
      public_id: req.file.filename
    };

    booking.timeline.push({
      status: "PAYMENT_PROOF_UPLOADED",
      timestamp: new Date(),
      description: "Payment proof uploaded for verification"
    });

    await booking.save();

    res.status(200).json({
      status: 200,
      message: "Payment proof uploaded successfully"
    });

  } catch (error) {
    console.error("Upload payment proof error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to upload payment proof",
      error: error.message
    });
  }
});

// Upload racquet images
router.post("/bookings/:bookingId/racquet-images", authenticate, upload.array('racquetImages', 5), async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const booking = await ServiceBooking.findOne({ 
      bookingId, 
      user: req.userId 
    });

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found"
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        status: 400,
        message: "Racquet images are required"
      });
    }

    // Add uploaded images
    const newImages = req.files.map(file => ({
      url: file.path,
      public_id: file.filename
    }));

    booking.racquetDetails.images.push(...newImages);

    booking.timeline.push({
      status: "RACQUET_IMAGES_UPLOADED",
      timestamp: new Date(),
      description: "Racquet images uploaded"
    });

    await booking.save();

    res.status(200).json({
      status: 200,
      message: "Racquet images uploaded successfully"
    });

  } catch (error) {
    console.error("Upload racquet images error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to upload racquet images",
      error: error.message
    });
  }
});

// Get user's service bookings
router.get("/my-bookings", authenticate, async (req, res) => {
  try {
    const bookings = await ServiceBooking.find({ user: req.userId })
      .populate('service')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 200,
      bookings
    });
  } catch (error) {
    console.error("Get bookings error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch bookings",
      error: error.message
    });
  }
});

// Get single booking details
router.get("/bookings/:bookingId", authenticate, async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const booking = await ServiceBooking.findOne({ 
      bookingId, 
      user: req.userId 
    }).populate('service');

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found"
      });
    }

    res.status(200).json({
      status: 200,
      booking
    });
  } catch (error) {
    console.error("Get booking error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch booking",
      error: error.message
    });
  }
});

// Cancel service booking
router.patch("/bookings/:bookingId/cancel", authenticate, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;
    
    const booking = await ServiceBooking.findOne({ 
      bookingId, 
      user: req.userId 
    });

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found"
      });
    }

    // Check if cancellation is allowed
    const nonCancellableStatuses = ['DELIVERED', 'CANCELLED', 'WORK_COMPLETED'];
    if (nonCancellableStatuses.includes(booking.status)) {
      return res.status(400).json({
        status: 400,
        message: "Booking cannot be cancelled at this stage"
      });
    }

    booking.status = 'CANCELLED';
    if (reason) {
      booking.notes.customer = (booking.notes.customer || '') + `\nCancellation reason: ${reason}`;
    }

    await booking.save();

    res.status(200).json({
      status: 200,
      message: "Booking cancelled successfully"
    });

  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to cancel booking",
      error: error.message
    });
  }
});

// ADMIN ROUTES

// Get all bookings (Admin only)
router.get("/admin/bookings", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    let filter = {};
    if (status) {
      filter.status = status;
    }

    const bookings = await ServiceBooking.find(filter)
      .populate('service')
      .populate('user', 'fname lname email phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await ServiceBooking.countDocuments(filter);

    res.status(200).json({
      status: 200,
      bookings,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get admin bookings error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch bookings",
      error: error.message
    });
  }
});

// Update booking status (Admin only)
router.patch("/admin/bookings/:bookingId/status", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status, notes } = req.body;
    
    const booking = await ServiceBooking.findOne({ bookingId });

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found"
      });
    }

    booking.status = status;
    
    if (notes) {
      booking.notes.admin = (booking.notes.admin || '') + `\n${notes}`;
    }

    // Set actual delivery date if status is DELIVERED
    if (status === 'DELIVERED') {
      booking.actualDeliveryDate = new Date();
    }

    await booking.save();

    res.status(200).json({
      status: 200,
      message: "Booking status updated successfully",
      booking
    });

  } catch (error) {
    console.error("Update booking status error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to update booking status",
      error: error.message
    });
  }
});

// Create/Update services (Admin only)
router.post("/admin/services", authenticate, authorizeRole('admin'), upload.single('image'), async (req, res) => {
  try {
    const { serviceName, displayName, description, price, estimatedDays } = req.body;
    
    const serviceData = {
      serviceName,
      displayName,
      description,
      price: parseFloat(price),
      estimatedDays: parseInt(estimatedDays)
    };

    if (req.file) {
      serviceData.image = req.file.path;
    }

    const service = new Service(serviceData);
    await service.save();

    res.status(201).json({
      status: 201,
      message: "Service created successfully",
      service
    });

  } catch (error) {
    console.error("Create service error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to create service",
      error: error.message
    });
  }
});

module.exports = router;