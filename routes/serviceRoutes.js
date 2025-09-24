const express = require("express");
const router = express.Router();
const { Service, ServiceBooking } = require("../models/serviceSchema");
const authenticate = require("../middleware/authenticate");
const authorizeRole = require("../middleware/authorizeRole");
const upload = require("../middleware/multer");

// Get all active services with their options
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

// Get single service by ID with all options
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

// Calculate service price based on selected options
router.post("/services/:id/calculate-price", async (req, res) => {
  try {
    const { selectedOptions, selectedString, selectedGripColor, selectedSize } = req.body;
    
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({
        status: 404,
        message: "Service not found"
      });
    }

    let totalPrice = service.basePrice;
    let breakdown = [{
      item: "Base Service",
      price: service.basePrice
    }];

    // Calculate options pricing
    if (selectedOptions && selectedOptions.length > 0) {
      selectedOptions.forEach(option => {
        const serviceOption = service.serviceOptions.find(
          so => so.optionType === option.optionType && so.optionValue === option.optionValue
        );
        if (serviceOption) {
          totalPrice += serviceOption.additionalPrice;
          breakdown.push({
            item: serviceOption.optionName,
            price: serviceOption.additionalPrice
          });
        }
      });
    }

    // Calculate string pricing
    if (selectedString) {
      const stringOption = service.availableStrings.find(
        s => s.stringName === selectedString.stringName
      );
      if (stringOption) {
        totalPrice += stringOption.additionalPrice;
        breakdown.push({
          item: `String: ${stringOption.stringName}`,
          price: stringOption.additionalPrice
        });
      }
    }

    // Calculate grip color pricing
    if (selectedGripColor) {
      const colorOption = service.availableGripColors.find(
        c => c.colorName === selectedGripColor.colorName
      );
      if (colorOption) {
        totalPrice += colorOption.additionalPrice;
        breakdown.push({
          item: `Grip Color: ${colorOption.colorName}`,
          price: colorOption.additionalPrice
        });
      }
    }

    // Calculate size pricing
    if (selectedSize) {
      const sizeCategory = service.availableSizes.find(
        s => s.category === selectedSize.category
      );
      if (sizeCategory) {
        totalPrice += sizeCategory.pricePerSize;
        breakdown.push({
          item: `Size: ${selectedSize.size} (${selectedSize.category})`,
          price: sizeCategory.pricePerSize
        });
      }
    }

    res.status(200).json({
      status: 200,
      basePrice: service.basePrice,
      totalPrice,
      breakdown
    });

  } catch (error) {
    console.error("Calculate price error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to calculate price",
      error: error.message
    });
  }
});

// Enhanced create service booking with options
router.post("/bookings", authenticate, async (req, res) => {
  try {
    const {
      serviceId,
      customerDetails,
      racquetDetails,
      pickupAddress,
      paymentMethod,
      notes,
      selectedOptions,
      selectedString,
      selectedGripColor,
      selectedSize
    } = req.body;

    // Validate service exists
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        status: 404,
        message: "Service not found"
      });
    }

    // Calculate total pricing
    let baseAmount = service.basePrice;
    let optionsAmount = 0;

    // Calculate options pricing
    if (selectedOptions && selectedOptions.length > 0) {
      selectedOptions.forEach(option => {
        const serviceOption = service.serviceOptions.find(
          so => so.optionType === option.optionType && so.optionValue === option.optionValue
        );
        if (serviceOption) {
          optionsAmount += serviceOption.additionalPrice;
        }
      });
    }

    // Add string pricing
    if (selectedString) {
      const stringOption = service.availableStrings.find(
        s => s.stringName === selectedString.stringName
      );
      if (stringOption) {
        optionsAmount += stringOption.additionalPrice;
      }
    }

    // Add grip color pricing
    if (selectedGripColor) {
      const colorOption = service.availableGripColors.find(
        c => c.colorName === selectedGripColor.colorName
      );
      if (colorOption) {
        optionsAmount += colorOption.additionalPrice;
      }
    }

    // Add size pricing
    if (selectedSize) {
      const sizeCategory = service.availableSizes.find(
        s => s.category === selectedSize.category
      );
      if (sizeCategory) {
        optionsAmount += sizeCategory.pricePerSize;
      }
    }

    // Enhanced racquet details
    const enhancedRacquetDetails = {
      ...racquetDetails,
      selectedOptions: selectedOptions || [],
      selectedString: selectedString || {},
      selectedGripColor: selectedGripColor || {},
      selectedSize: selectedSize || {}
    };

    // Create booking
    const booking = new ServiceBooking({
      user: req.userId,
      service: serviceId,
      customerDetails,
      racquetDetails: enhancedRacquetDetails,
      pickupAddress,
      paymentDetails: {
        method: paymentMethod,
        baseAmount,
        optionsAmount,
        totalAmount: baseAmount + optionsAmount,
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

// ADMIN ROUTES - Enhanced service creation with options

// Create service with options (Admin only)
router.post("/admin/services", authenticate, authorizeRole('admin'), upload.single('image'), async (req, res) => {
  try {
    const { 
      serviceName, 
      displayName, 
      description, 
      basePrice, 
      estimatedDays,
      serviceOptions,
      availableStrings,
      availableGripColors,
      availableSizes
    } = req.body;
    
    const serviceData = {
      serviceName,
      displayName,
      description,
      basePrice: parseFloat(basePrice),
      estimatedDays: parseInt(estimatedDays),
      serviceOptions: serviceOptions ? JSON.parse(serviceOptions) : [],
      availableStrings: availableStrings ? JSON.parse(availableStrings) : [],
      availableGripColors: availableGripColors ? JSON.parse(availableGripColors) : [],
      availableSizes: availableSizes ? JSON.parse(availableSizes) : []
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

// Update service with options (Admin only)
router.put("/admin/services/:id", authenticate, authorizeRole('admin'), upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      serviceName, 
      displayName, 
      description, 
      basePrice, 
      estimatedDays,
      serviceOptions,
      availableStrings,
      availableGripColors,
      availableSizes
    } = req.body;
    
    const updateData = {
      serviceName,
      displayName,
      description,
      basePrice: parseFloat(basePrice),
      estimatedDays: parseInt(estimatedDays),
      serviceOptions: serviceOptions ? JSON.parse(serviceOptions) : [],
      availableStrings: availableStrings ? JSON.parse(availableStrings) : [],
      availableGripColors: availableGripColors ? JSON.parse(availableGripColors) : [],
      availableSizes: availableSizes ? JSON.parse(availableSizes) : []
    };

    if (req.file) {
      updateData.image = req.file.path;
    }

    const service = await Service.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );

    if (!service) {
      return res.status(404).json({
        status: 404,
        message: "Service not found"
      });
    }

    res.status(200).json({
      status: 200,
      message: "Service updated successfully",
      service
    });

  } catch (error) {
    console.error("Update service error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to update service",
      error: error.message
    });
  }
});

// Add string option to service (Admin only)
router.post("/admin/services/:id/strings", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { stringName, stringBrand, additionalPrice } = req.body;
    
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({
        status: 404,
        message: "Service not found"
      });
    }

    service.availableStrings.push({
      stringName,
      stringBrand,
      additionalPrice: parseFloat(additionalPrice) || 0,
      isAvailable: true
    });

    await service.save();

    res.status(200).json({
      status: 200,
      message: "String option added successfully",
      service
    });

  } catch (error) {
    console.error("Add string option error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to add string option",
      error: error.message
    });
  }
});

// Add grip color to service (Admin only)
router.post("/admin/services/:id/grip-colors", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { colorName, colorCode, additionalPrice } = req.body;
    
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({
        status: 404,
        message: "Service not found"
      });
    }

    service.availableGripColors.push({
      colorName,
      colorCode,
      additionalPrice: parseFloat(additionalPrice) || 0
    });

    await service.save();

    res.status(200).json({
      status: 200,
      message: "Grip color added successfully",
      service
    });

  } catch (error) {
    console.error("Add grip color error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to add grip color",
      error: error.message
    });
  }
});
// Get all services (Admin only - including inactive ones) - ADD THIS ROUTE
router.get("/admin/services", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    let filter = {};
    if (status) {
      filter.isActive = status === 'active';
    }

    const services = await Service.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Service.countDocuments(filter);

    res.status(200).json({
      status: 200,
      services,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get admin services error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch services",
      error: error.message
    });
  }
});
// Add these routes to your existing router file (serviceRoutes.js)

// Delete service (Admin only)
router.delete("/admin/services/:id", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if service exists
    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        status: 404,
        message: "Service not found"
      });
    }

    // Check if there are any active bookings for this service
    const activeBookings = await ServiceBooking.countDocuments({
      service: id,
      status: { $in: ['BOOKING_CONFIRMED', 'PICKUP_SCHEDULED', 'ITEM_PICKED_UP', 'IN_PROGRESS'] }
    });

    if (activeBookings > 0) {
      return res.status(400).json({
        status: 400,
        message: `Cannot delete service. ${activeBookings} active booking(s) exist for this service.`,
        activeBookings
      });
    }

    // Soft delete - just mark as inactive instead of actually deleting
    // This preserves historical data for completed bookings
    await Service.findByIdAndUpdate(id, { 
      isActive: false, 
      deletedAt: new Date() 
    });

    res.status(200).json({
      status: 200,
      message: "Service deleted successfully"
    });

  } catch (error) {
    console.error("Delete service error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to delete service",
      error: error.message
    });
  }
});

// Toggle service active status (Admin only)
router.patch("/admin/services/:id/toggle-status", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        status: 404,
        message: "Service not found"
      });
    }

    // Toggle the active status
    service.isActive = !service.isActive;
    await service.save();

    res.status(200).json({
      status: 200,
      message: `Service ${service.isActive ? 'activated' : 'deactivated'} successfully`,
      service
    });

  } catch (error) {
    console.error("Toggle service status error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to toggle service status",
      error: error.message
    });
  }
});

// Hard delete service (Admin only) - Use with caution
router.delete("/admin/services/:id/permanent", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmDelete } = req.body;

    if (!confirmDelete) {
      return res.status(400).json({
        status: 400,
        message: "Confirmation required for permanent deletion"
      });
    }

    // Check if service exists
    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        status: 404,
        message: "Service not found"
      });
    }

    // Check for ANY bookings (active or completed) for this service
    const totalBookings = await ServiceBooking.countDocuments({ service: id });
    
    if (totalBookings > 0) {
      return res.status(400).json({
        status: 400,
        message: `Cannot permanently delete service. ${totalBookings} booking(s) exist for this service. Use soft delete instead.`,
        totalBookings
      });
    }

    // Permanently delete the service
    await Service.findByIdAndDelete(id);

    res.status(200).json({
      status: 200,
      message: "Service permanently deleted successfully"
    });

  } catch (error) {
    console.error("Permanent delete service error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to permanently delete service",
      error: error.message
    });
  }
});
// Add these routes to your existing serviceRoutes.js file

// ====================
// ADMIN BOOKING MANAGEMENT ROUTES
// ====================

// Get all bookings with filters and pagination (Admin only)
router.get("/admin/bookings", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const {
      status,
      serviceType,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    let filter = {};
    
    if (status) {
      filter.status = status;
    }
    
    if (serviceType) {
      // Find service IDs that match the service type
      const services = await Service.find({ serviceName: serviceType }).select('_id');
      const serviceIds = services.map(s => s._id);
      filter.service = { $in: serviceIds };
    }
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    if (search) {
      filter.$or = [
        { bookingId: { $regex: search, $options: 'i' } },
        { 'customerDetails.fullName': { $regex: search, $options: 'i' } },
        { 'customerDetails.email': { $regex: search, $options: 'i' } },
        { 'customerDetails.phone': { $regex: search, $options: 'i' } },
        { 'racquetDetails.brand': { $regex: search, $options: 'i' } },
        { 'racquetDetails.model': { $regex: search, $options: 'i' } }
      ];
    }

    // Setup sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with population
    const bookings = await ServiceBooking.find(filter)
      .populate('service', 'displayName serviceName basePrice')
      .populate('user', 'name email phone')
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await ServiceBooking.countDocuments(filter);

    // Get status summary for dashboard
    const statusSummary = await ServiceBooking.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.status(200).json({
      status: 200,
      bookings,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit)
      },
      summary: {
        total,
        statusBreakdown: statusSummary
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

// Get detailed booking information (Admin only)
router.get("/admin/bookings/:id", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const booking = await ServiceBooking.findById(req.params.id)
      .populate('service', 'displayName serviceName description basePrice estimatedDays')
      .populate('user', 'name email phone createdAt');

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found"
      });
    }

    // Calculate pricing breakdown
    const pricingBreakdown = [
      {
        item: "Base Service",
        price: booking.paymentDetails.baseAmount
      }
    ];

    // Add selected options pricing
    if (booking.racquetDetails.selectedOptions && booking.racquetDetails.selectedOptions.length > 0) {
      booking.racquetDetails.selectedOptions.forEach(option => {
        pricingBreakdown.push({
          item: option.optionName,
          price: option.additionalPrice || 0
        });
      });
    }

    // Add string pricing
    if (booking.racquetDetails.selectedString && booking.racquetDetails.selectedString.stringName) {
      pricingBreakdown.push({
        item: `String: ${booking.racquetDetails.selectedString.stringName}`,
        price: booking.racquetDetails.selectedString.additionalPrice || 0
      });
    }

    // Add grip color pricing
    if (booking.racquetDetails.selectedGripColor && booking.racquetDetails.selectedGripColor.colorName) {
      pricingBreakdown.push({
        item: `Grip Color: ${booking.racquetDetails.selectedGripColor.colorName}`,
        price: booking.racquetDetails.selectedGripColor.additionalPrice || 0
      });
    }

    // Add size pricing
    if (booking.racquetDetails.selectedSize && booking.racquetDetails.selectedSize.size) {
      pricingBreakdown.push({
        item: `Size: ${booking.racquetDetails.selectedSize.size}`,
        price: booking.racquetDetails.selectedSize.additionalPrice || 0
      });
    }

    res.status(200).json({
      status: 200,
      booking,
      pricingBreakdown,
      totalAmount: booking.paymentDetails.totalAmount
    });

  } catch (error) {
    console.error("Get booking details error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch booking details",
      error: error.message
    });
  }
});

// Update booking status (Admin only)
router.patch("/admin/bookings/:id/status", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { newStatus, notes, notifyCustomer = true } = req.body;
    
    // Validate status
    const validStatuses = [
      "BOOKING_CONFIRMED", "PICKUP_SCHEDULED", "RACQUET_COLLECTED",
      "WORK_IN_PROGRESS", "WORK_COMPLETED", "READY_FOR_DELIVERY",
      "DELIVERED", "CANCELLED"
    ];
    
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({
        status: 400,
        message: "Invalid status provided"
      });
    }

    const booking = await ServiceBooking.findById(req.params.id)
      .populate('service')
      .populate('user');

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found"
      });
    }

    // Update status and add to timeline
    const previousStatus = booking.status;
    booking.status = newStatus;
    
    // Add admin note if provided
    if (notes) {
      booking.notes.admin = (booking.notes.admin || '') + `\n[${new Date().toLocaleString()}] Status updated to ${newStatus}: ${notes}`;
    }

    // Set actual delivery date if delivered
    if (newStatus === 'DELIVERED') {
      booking.actualDeliveryDate = new Date();
    }

    // Update estimated delivery if work completed
    if (newStatus === 'WORK_COMPLETED' && !booking.estimatedDeliveryDate) {
      const estimatedDate = new Date();
      estimatedDate.setDate(estimatedDate.getDate() + 2); // 2 days for delivery
      booking.estimatedDeliveryDate = estimatedDate;
    }

    await booking.save();

    // TODO: Send notification to customer if notifyCustomer is true
    // You can integrate with your notification service here

    res.status(200).json({
      status: 200,
      message: "Booking status updated successfully",
      booking: {
        id: booking._id,
        bookingId: booking.bookingId,
        previousStatus,
        newStatus,
        timeline: booking.timeline
      }
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

// Assign booking to technician (Admin only)
router.patch("/admin/bookings/:id/assign", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { technicianId, technicianName, notes } = req.body;

    const booking = await ServiceBooking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found"
      });
    }

    // Add assignment info to booking (you may need to add these fields to schema)
    booking.assignedTechnician = {
      id: technicianId,
      name: technicianName,
      assignedAt: new Date()
    };

    // Add to timeline
    booking.timeline.push({
      status: "TECHNICIAN_ASSIGNED",
      timestamp: new Date(),
      description: `Assigned to technician: ${technicianName}`
    });

    // Add admin note
    if (notes) {
      booking.notes.admin = (booking.notes.admin || '') + `\n[${new Date().toLocaleString()}] Assigned to ${technicianName}: ${notes}`;
    }

    await booking.save();

    res.status(200).json({
      status: 200,
      message: "Technician assigned successfully",
      assignment: booking.assignedTechnician
    });

  } catch (error) {
    console.error("Assign technician error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to assign technician",
      error: error.message
    });
  }
});

// Update booking pricing (Admin only)
router.patch("/admin/bookings/:id/pricing", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { adjustmentAmount, adjustmentReason, adjustmentType } = req.body;
    
    // adjustmentType can be 'additional_charge', 'discount', 'correction'
    
    const booking = await ServiceBooking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found"
      });
    }

    const previousTotal = booking.paymentDetails.totalAmount;
    
    // Apply adjustment
    if (adjustmentType === 'discount') {
      booking.paymentDetails.totalAmount -= parseFloat(adjustmentAmount);
    } else {
      booking.paymentDetails.totalAmount += parseFloat(adjustmentAmount);
    }

    // Add to timeline
    booking.timeline.push({
      status: "PRICING_ADJUSTED",
      timestamp: new Date(),
      description: `Pricing ${adjustmentType}: ₹${adjustmentAmount} - ${adjustmentReason}`
    });

    // Add admin note
    booking.notes.admin = (booking.notes.admin || '') + 
      `\n[${new Date().toLocaleString()}] Pricing adjusted: ${adjustmentType} of ₹${adjustmentAmount} - ${adjustmentReason}. Previous: ₹${previousTotal}, New: ₹${booking.paymentDetails.totalAmount}`;

    await booking.save();

    res.status(200).json({
      status: 200,
      message: "Pricing updated successfully",
      pricingUpdate: {
        previousAmount: previousTotal,
        adjustment: adjustmentAmount,
        adjustmentType,
        newAmount: booking.paymentDetails.totalAmount,
        reason: adjustmentReason
      }
    });

  } catch (error) {
    console.error("Update pricing error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to update pricing",
      error: error.message
    });
  }
});

// Add custom timeline entry (Admin only)
router.post("/admin/bookings/:id/timeline", authenticate, authorizeRole('admin'), upload.array('images', 5), async (req, res) => {
  try {
    const { description, entryType = "ADMIN_UPDATE" } = req.body;

    const booking = await ServiceBooking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found"
      });
    }

    // Create timeline entry
    const timelineEntry = {
      status: entryType,
      timestamp: new Date(),
      description,
      images: []
    };

    // Add images if provided
    if (req.files && req.files.length > 0) {
      timelineEntry.images = req.files.map(file => ({
        url: file.path,
        public_id: file.filename
      }));
    }

    booking.timeline.push(timelineEntry);
    await booking.save();

    res.status(200).json({
      status: 200,
      message: "Timeline entry added successfully",
      timelineEntry
    });

  } catch (error) {
    console.error("Add timeline entry error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to add timeline entry",
      error: error.message
    });
  }
});

// Get booking statistics and analytics (Admin only)
router.get("/admin/bookings/stats", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { period = '30days' } = req.query;
    
    // Calculate date range
    let startDate = new Date();
    switch (period) {
      case '7days':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    // Total bookings and revenue
    const totalStats = await ServiceBooking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          totalRevenue: { $sum: "$paymentDetails.totalAmount" },
          averageOrderValue: { $avg: "$paymentDetails.totalAmount" }
        }
      }
    ]);

    // Status breakdown
    const statusStats = await ServiceBooking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          revenue: { $sum: "$paymentDetails.totalAmount" }
        }
      }
    ]);

    // Service popularity
    const serviceStats = await ServiceBooking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $lookup: {
          from: "services",
          localField: "service",
          foreignField: "_id",
          as: "serviceInfo"
        }
      },
      {
        $unwind: "$serviceInfo"
      },
      {
        $group: {
          _id: "$serviceInfo.displayName",
          serviceName: { $first: "$serviceInfo.serviceName" },
          count: { $sum: 1 },
          revenue: { $sum: "$paymentDetails.totalAmount" },
          avgCompletionDays: { $avg: { $divide: [{ $subtract: ["$actualDeliveryDate", "$createdAt"] }, 86400000] } }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Daily bookings trend
    const dailyTrend = await ServiceBooking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" }
          },
          bookings: { $sum: 1 },
          revenue: { $sum: "$paymentDetails.totalAmount" }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
      }
    ]);

    // Payment method stats
    const paymentStats = await ServiceBooking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: "$paymentDetails.method",
          count: { $sum: 1 },
          revenue: { $sum: "$paymentDetails.totalAmount" }
        }
      }
    ]);

    // Average completion time for delivered orders
    const completionStats = await ServiceBooking.aggregate([
      {
        $match: {
          status: "DELIVERED",
          createdAt: { $gte: startDate },
          actualDeliveryDate: { $exists: true }
        }
      },
      {
        $project: {
          completionDays: {
            $divide: [
              { $subtract: ["$actualDeliveryDate", "$createdAt"] },
              86400000 // Convert milliseconds to days
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgCompletionDays: { $avg: "$completionDays" },
          minCompletionDays: { $min: "$completionDays" },
          maxCompletionDays: { $max: "$completionDays" }
        }
      }
    ]);

    res.status(200).json({
      status: 200,
      period,
      startDate,
      stats: {
        overview: totalStats[0] || { totalBookings: 0, totalRevenue: 0, averageOrderValue: 0 },
        statusBreakdown: statusStats,
        servicePopularity: serviceStats,
        dailyTrend,
        paymentMethods: paymentStats,
        completionTime: completionStats[0] || { avgCompletionDays: 0, minCompletionDays: 0, maxCompletionDays: 0 }
      }
    });

  } catch (error) {
    console.error("Get booking stats error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch booking statistics",
      error: error.message
    });
  }
});

// Bulk update booking statuses (Admin only)
router.patch("/admin/bookings/bulk-update", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { bookingIds, newStatus, notes } = req.body;

    if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
      return res.status(400).json({
        status: 400,
        message: "Booking IDs array is required"
      });
    }

    const validStatuses = [
      "BOOKING_CONFIRMED", "PICKUP_SCHEDULED", "RACQUET_COLLECTED",
      "WORK_IN_PROGRESS", "WORK_COMPLETED", "READY_FOR_DELIVERY",
      "DELIVERED", "CANCELLED"
    ];

    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({
        status: 400,
        message: "Invalid status provided"
      });
    }

    // Update all bookings
    const updateResult = await ServiceBooking.updateMany(
      { _id: { $in: bookingIds } },
      {
        $set: { status: newStatus },
        $push: {
          timeline: {
            status: newStatus,
            timestamp: new Date(),
            description: `Bulk updated to ${newStatus}${notes ? ': ' + notes : ''}`
          }
        }
      }
    );

    res.status(200).json({
      status: 200,
      message: `${updateResult.modifiedCount} bookings updated successfully`,
      updated: updateResult.modifiedCount,
      newStatus
    });

  } catch (error) {
    console.error("Bulk update bookings error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to bulk update bookings",
      error: error.message
    });
  }
});
// Add these routes to your existing serviceRoutes.js file

// ====================
// USER BOOKING ROUTES
// ====================

// Get user's own bookings (User must be authenticated)
router.get("/user/bookings", authenticate, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    
    // Build filter object
    let filter = { user: req.userId };
    
    if (status) {
      filter.status = status;
    }
    
    if (search) {
      filter.$or = [
        { bookingId: { $regex: search, $options: 'i' } },
        { 'racquetDetails.brand': { $regex: search, $options: 'i' } },
        { 'racquetDetails.model': { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query with population
    const bookings = await ServiceBooking.find(filter)
      .populate('service', 'displayName serviceName basePrice estimatedDays')
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
        pages: Math.ceil(total / limit),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error("Get user bookings error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch your bookings",
      error: error.message
    });
  }
});

// Get specific booking details (User can only access their own bookings)
router.get("/user/bookings/:id", authenticate, async (req, res) => {
  try {
    const booking = await ServiceBooking.findOne({
      _id: req.params.id,
      user: req.userId // Ensure user can only access their own bookings
    })
    .populate('service', 'displayName serviceName description basePrice estimatedDays')
    .populate('user', 'name email phone');

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found or you don't have access to this booking"
      });
    }

    res.status(200).json({
      status: 200,
      booking
    });

  } catch (error) {
    console.error("Get user booking details error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch booking details",
      error: error.message
    });
  }
});

// Add customer note to booking
router.patch("/user/bookings/:id/note", authenticate, async (req, res) => {
  try {
    const { note } = req.body;
    
    if (!note || note.trim() === '') {
      return res.status(400).json({
        status: 400,
        message: "Note content is required"
      });
    }

    const booking = await ServiceBooking.findOne({
      _id: req.params.id,
      user: req.userId
    });

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found or you don't have access to this booking"
      });
    }

    // Add timestamp to the note
    const timestamp = new Date().toLocaleString('en-IN');
    const noteWithTimestamp = `[${timestamp}] ${note.trim()}`;
    
    // Append to existing customer notes or create new
    booking.notes.customer = booking.notes.customer 
      ? `${booking.notes.customer}\n${noteWithTimestamp}`
      : noteWithTimestamp;

    await booking.save();

    res.status(200).json({
      status: 200,
      message: "Note added successfully",
      note: noteWithTimestamp
    });

  } catch (error) {
    console.error("Add customer note error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to add note",
      error: error.message
    });
  }
});

// Get user's booking statistics
router.get("/user/bookings/stats", authenticate, async (req, res) => {
  try {
    // Total bookings for user
    const totalBookings = await ServiceBooking.countDocuments({ user: req.userId });

    // Status breakdown
    const statusStats = await ServiceBooking.aggregate([
      { $match: { user: req.userId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Recent bookings (last 5)
    const recentBookings = await ServiceBooking.find({ user: req.userId })
      .populate('service', 'displayName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('bookingId service status createdAt paymentDetails.totalAmount');

    // Total spent
    const totalSpent = await ServiceBooking.aggregate([
      { $match: { user: req.userId, status: { $ne: 'CANCELLED' } } },
      { $group: { _id: null, total: { $sum: '$paymentDetails.totalAmount' } } }
    ]);

    res.status(200).json({
      status: 200,
      stats: {
        totalBookings,
        statusBreakdown: statusStats,
        recentBookings,
        totalSpent: totalSpent[0]?.total || 0
      }
    });

  } catch (error) {
    console.error("Get user booking stats error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch booking statistics",
      error: error.message
    });
  }
});

// Cancel booking (User can cancel their own booking if in certain statuses)
router.patch("/user/bookings/:id/cancel", authenticate, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const booking = await ServiceBooking.findOne({
      _id: req.params.id,
      user: req.userId
    });

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found or you don't have access to this booking"
      });
    }

    // Check if booking can be cancelled
    const cancellableStatuses = ['BOOKING_CONFIRMED', 'PICKUP_SCHEDULED'];
    if (!cancellableStatuses.includes(booking.status)) {
      return res.status(400).json({
        status: 400,
        message: "This booking cannot be cancelled at its current stage"
      });
    }

    // Update booking status to cancelled
    booking.status = 'CANCELLED';
    
    // Add cancellation reason to customer notes
    const timestamp = new Date().toLocaleString('en-IN');
    const cancellationNote = `[${timestamp}] Booking cancelled by customer${reason ? `: ${reason}` : ''}`;
    
    booking.notes.customer = booking.notes.customer 
      ? `${booking.notes.customer}\n${cancellationNote}`
      : cancellationNote;

    // Add to timeline
    booking.timeline.push({
      status: 'CANCELLED',
      timestamp: new Date(),
      description: `Booking cancelled by customer${reason ? `: ${reason}` : ''}`
    });

    await booking.save();

    res.status(200).json({
      status: 200,
      message: "Booking cancelled successfully",
      booking: {
        id: booking._id,
        bookingId: booking.bookingId,
        status: booking.status
      }
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

// Get user profile (if you don't have a separate user routes file)
router.get("/user/profile", authenticate, async (req, res) => {
  try {
    // Assuming you have a User model, adjust the import and model name as needed
    const User = require('../models/userSchema'); // Adjust path as needed
    
    const user = await User.findById(req.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        status: 404,
        message: "User not found"
      });
    }

    res.status(200).json({
      status: 200,
      user
    });

  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch user profile",
      error: error.message
    });
  }
});

// Update user profile
router.patch("/user/profile", authenticate, async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    const User = require('../models/userSchema'); // Adjust path as needed
    
    const updateData = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (email) updateData.email = email;

    const user = await User.findByIdAndUpdate(
      req.userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        status: 404,
        message: "User not found"
      });
    }

    res.status(200).json({
      status: 200,
      message: "Profile updated successfully",
      user
    });

  } catch (error) {
    console.error("Update user profile error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to update profile",
      error: error.message
    });
  }
});
// Add these routes to your existing serviceRoutes.js file

// ====================
// IMAGE AND FILE HANDLING ROUTES
// ====================

// Upload payment proof for booking
router.post("/bookings/:bookingId/payment-proof", authenticate, upload.single('paymentProof'), async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    // Find booking and verify ownership
    const booking = await ServiceBooking.findOne({
      $or: [
        { _id: bookingId },
        { bookingId: bookingId }
      ],
      user: req.userId
    });

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found or you don't have access to this booking"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        status: 400,
        message: "Payment proof file is required"
      });
    }

    // Update booking with payment proof
    booking.paymentDetails.paymentProof = {
      url: req.file.path,
      public_id: req.file.filename
    };

    // Update payment status if it was pending
    if (booking.paymentDetails.status === 'PENDING') {
      booking.paymentDetails.status = 'PAID';
    }

    // Add to timeline
    booking.timeline.push({
      status: "PAYMENT_PROOF_UPLOADED",
      timestamp: new Date(),
      description: "Payment proof uploaded by customer"
    });

    await booking.save();

    res.status(200).json({
      status: 200,
      message: "Payment proof uploaded successfully",
      paymentProof: booking.paymentDetails.paymentProof
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

// Upload racquet images for booking
router.post("/bookings/:bookingId/racquet-images", authenticate, upload.array('racquetImages', 5), async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    // Find booking and verify ownership
    const booking = await ServiceBooking.findOne({
      $or: [
        { _id: bookingId },
        { bookingId: bookingId }
      ],
      user: req.userId
    });

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found or you don't have access to this booking"
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        status: 400,
        message: "At least one racquet image is required"
      });
    }

    // Add images to booking
    const newImages = req.files.map(file => ({
      url: file.path,
      public_id: file.filename
    }));

    // Append to existing images or create new array
    booking.racquetDetails.images = booking.racquetDetails.images 
      ? [...booking.racquetDetails.images, ...newImages]
      : newImages;

    // Limit to 10 images total
    if (booking.racquetDetails.images.length > 10) {
      booking.racquetDetails.images = booking.racquetDetails.images.slice(0, 10);
    }

    // Add to timeline
    booking.timeline.push({
      status: "RACQUET_IMAGES_UPLOADED",
      timestamp: new Date(),
      description: `${req.files.length} racquet image(s) uploaded by customer`
    });

    await booking.save();

    res.status(200).json({
      status: 200,
      message: "Racquet images uploaded successfully",
      images: newImages,
      totalImages: booking.racquetDetails.images.length
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

// ====================
// ADMIN IMAGE ACCESS ROUTES
// ====================

// Get payment proof for booking (Admin only)
router.get("/admin/bookings/:id/payment-proof", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const booking = await ServiceBooking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found"
      });
    }

    if (!booking.paymentDetails.paymentProof || !booking.paymentDetails.paymentProof.url) {
      return res.status(404).json({
        status: 404,
        message: "Payment proof not found for this booking"
      });
    }

    // For local file system storage
    const fs = require('fs');
    const path = require('path');
    
    // Construct file path (adjust based on your multer configuration)
    const filePath = path.join(__dirname, '..', booking.paymentDetails.paymentProof.url);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        status: 404,
        message: "Payment proof file not found on server"
      });
    }

    // Send file
    res.sendFile(path.resolve(filePath));

  } catch (error) {
    console.error("Get payment proof error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to retrieve payment proof",
      error: error.message
    });
  }
});

// Get racquet images for booking (Admin only)
router.get("/admin/bookings/:id/racquet-images", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const booking = await ServiceBooking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found"
      });
    }

    const images = booking.racquetDetails.images || [];
    
    // Process images to create full URLs
    const processedImages = images.map((image, index) => ({
      id: index,
      url: image.url.startsWith('/') ? image.url : `/uploads/${image.url}`,
      public_id: image.public_id,
      filename: path.basename(image.url)
    }));

    res.status(200).json({
      status: 200,
      images: processedImages,
      totalImages: processedImages.length
    });

  } catch (error) {
    console.error("Get racquet images error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to retrieve racquet images",
      error: error.message
    });
  }
});

// Serve individual racquet image (Admin only)
router.get("/admin/bookings/:id/racquet-images/:imageIndex", authenticate, authorizeRole('admin'), async (req, res) => {
  try {
    const { id, imageIndex } = req.params;
    const booking = await ServiceBooking.findById(id);
    
    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found"
      });
    }

    const images = booking.racquetDetails.images || [];
    const imageIdx = parseInt(imageIndex);
    
    if (imageIdx < 0 || imageIdx >= images.length) {
      return res.status(404).json({
        status: 404,
        message: "Image not found"
      });
    }

    const image = images[imageIdx];
    
    // For local file system storage
    const fs = require('fs');
    const path = require('path');
    
    // Construct file path
    const filePath = path.join(__dirname, '..', image.url);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        status: 404,
        message: "Image file not found on server"
      });
    }

    // Send file
    res.sendFile(path.resolve(filePath));

  } catch (error) {
    console.error("Get racquet image error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to retrieve racquet image",
      error: error.message
    });
  }
});

// ====================
// USER IMAGE ACCESS ROUTES
// ====================

// Get user's own payment proof
router.get("/user/bookings/:id/payment-proof", authenticate, async (req, res) => {
  try {
    const booking = await ServiceBooking.findOne({
      _id: req.params.id,
      user: req.userId
    });
    
    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found or access denied"
      });
    }

    if (!booking.paymentDetails.paymentProof || !booking.paymentDetails.paymentProof.url) {
      return res.status(404).json({
        status: 404,
        message: "Payment proof not found"
      });
    }

    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '..', booking.paymentDetails.paymentProof.url);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        status: 404,
        message: "Payment proof file not found"
      });
    }

    res.sendFile(path.resolve(filePath));

  } catch (error) {
    console.error("Get user payment proof error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to retrieve payment proof",
      error: error.message
    });
  }
});

// Get user's own racquet images
router.get("/user/bookings/:id/racquet-images", authenticate, async (req, res) => {
  try {
    const booking = await ServiceBooking.findOne({
      _id: req.params.id,
      user: req.userId
    });
    
    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found or access denied"
      });
    }

    const images = booking.racquetDetails.images || [];
    
    const processedImages = images.map((image, index) => ({
      id: index,
      url: image.url.startsWith('/') ? image.url : `/uploads/${image.url}`,
      public_id: image.public_id,
      filename: path.basename(image.url)
    }));

    res.status(200).json({
      status: 200,
      images: processedImages,
      totalImages: processedImages.length
    });

  } catch (error) {
    console.error("Get user racquet images error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to retrieve racquet images",
      error: error.message
    });
  }
});

// Delete racquet image (User can delete their own images)
router.delete("/user/bookings/:id/racquet-images/:imageIndex", authenticate, async (req, res) => {
  try {
    const { id, imageIndex } = req.params;
    const booking = await ServiceBooking.findOne({
      _id: id,
      user: req.userId
    });
    
    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found or access denied"
      });
    }

    const imageIdx = parseInt(imageIndex);
    if (imageIdx < 0 || imageIdx >= booking.racquetDetails.images.length) {
      return res.status(404).json({
        status: 404,
        message: "Image not found"
      });
    }

    // Remove image from array
    const deletedImage = booking.racquetDetails.images.splice(imageIdx, 1)[0];
    
    // Optionally delete the file from filesystem
    const fs = require('fs');
    const path = require('path');
    const filePath = path.join(__dirname, '..', deletedImage.url);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await booking.save();

    res.status(200).json({
      status: 200,
      message: "Image deleted successfully",
      remainingImages: booking.racquetDetails.images.length
    });

  } catch (error) {
    console.error("Delete racquet image error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to delete image",
      error: error.message
    });
  }
});

// ====================
// STATIC FILE SERVING (if not handled by express.static)
// ====================

// Serve uploaded files (if you haven't set up express.static for uploads)
router.get("/uploads/:filename", (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(__dirname, '..', 'uploads', req.params.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      status: 404,
      message: "File not found"
    });
  }

  res.sendFile(path.resolve(filePath));
});

// Alternative: Serve files with proper content type detection
router.get("/files/:bookingId/:filename", authenticate, async (req, res) => {
  try {
    const { bookingId, filename } = req.params;
    
    // Verify user has access to this booking (either as owner or admin)
    let booking;
    if (req.userRole === 'admin') {
      booking = await ServiceBooking.findOne({
        $or: [
          { _id: bookingId },
          { bookingId: bookingId }
        ]
      });
    } else {
      booking = await ServiceBooking.findOne({
        $or: [
          { _id: bookingId },
          { bookingId: bookingId }
        ],
        user: req.userId
      });
    }

    if (!booking) {
      return res.status(404).json({
        status: 404,
        message: "Booking not found or access denied"
      });
    }

    const fs = require('fs');
    const path = require('path');
    const mime = require('mime-types'); // Install: npm install mime-types
    
    // Look for file in booking's images or payment proof
    let filePath = null;
    const uploadDir = path.join(__dirname, '..', 'uploads');
    
    // Check in various subdirectories
    const possiblePaths = [
      path.join(uploadDir, filename),
      path.join(uploadDir, 'payments', filename),
      path.join(uploadDir, 'racquets', filename),
      path.join(uploadDir, bookingId, filename)
    ];

    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        filePath = possiblePath;
        break;
      }
    }

    if (!filePath) {
      return res.status(404).json({
        status: 404,
        message: "File not found"
      });
    }

    // Set proper content type
    const contentType = mime.lookup(filePath) || 'application/octet-stream';
    res.contentType(contentType);
    
    // Send file
    res.sendFile(path.resolve(filePath));

  } catch (error) {
    console.error("Serve file error:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to serve file",
      error: error.message
    });
  }
});

// Export additional dependencies needed
const path = require('path');
module.exports = router;