const mongoose = require("mongoose");

// Enhanced service schema with options and pricing
const serviceSchema = new mongoose.Schema({
  serviceName: {
    type: String,
    required: true,
    enum: [
      "racquet_repair", 
      "racquet_painting", 
      "grip_replacement", 
      "racquet_stringing", 
      "shoes_sole_replacement"
    ]
  },
  displayName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  basePrice: {
    type: Number,
    required: true,
    default: 0
  },
  estimatedDays: {
    type: Number,
    required: true,
    default: 3
  },
  isActive: {
    type: Boolean,
    default: true
  },
  image: {
    type: String,
    required: false
  },
  
  // Service-specific options with pricing
  serviceOptions: [{
    optionType: {
      type: String,
      required: true,
      enum: [
        "racquet_type", // For repair: low/mid/premium
        "paint_type", // For painting: simple/new_design
        "grip_type", // For grip: standard/cushion_wrap
        "grip_color", // Color options for grip
        "string_type", // String options for stringing
        "shoe_sport", // Sport type for shoes
        "shoe_category", // Men's/Women's for shoes
        "add_ons" // Additional services like grommets, handle repair
      ]
    },
    optionName: {
      type: String,
      required: true
    },
    optionValue: {
      type: String,
      required: false
    },
    additionalPrice: {
      type: Number,
      default: 0
    },
    isRequired: {
      type: Boolean,
      default: false
    },
    description: String
  }],
  
  // Available string choices (for admin to manage)
  availableStrings: [{
    stringName: {
      type: String,
      required: true
    },
    stringBrand: String,
    additionalPrice: {
      type: Number,
      default: 0
    },
    isAvailable: {
      type: Boolean,
      default: true
    }
  }],
  
  // Available grip colors
  availableGripColors: [{
    colorName: String,
    colorCode: String,
    additionalPrice: {
      type: Number,
      default: 0
    }
  }],
  
  // Size ranges for shoes
  availableSizes: [{
    category: {
      type: String,
      enum: ["men", "women"]
    },
    sizes: [String],
    pricePerSize: {
      type: Number,
      default: 0
    }
  }]
}, {
  timestamps: true
});

// Enhanced booking schema to handle selected options
const serviceBookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `SB${timestamp}${random}`;
    }
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "users",
    required: true
  },
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Service",
    required: true
  },
  customerDetails: {
    fullName: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    }
  },
  racquetDetails: {
    brand: {
      type: String,
      required: true
    },
    model: {
      type: String,
      required: false
    },
    racquetName: String, // New field for racquet name
    
    // Selected service options
    selectedOptions: [{
      optionType: String,
      optionName: String,
      optionValue: String,
      additionalPrice: Number
    }],
    
    // For stringing services
    selectedString: {
      stringName: String,
      stringBrand: String,
      stringTension: String,
      additionalPrice: {
        type: Number,
        default: 0
      }
    },
    
    // For grip services
    selectedGripColor: {
      colorName: String,
      colorCode: String,
      additionalPrice: {
        type: Number,
        default: 0
      }
    },
    
    // For shoes
    selectedSize: {
      category: String,
      size: String,
      additionalPrice: {
        type: Number,
        default: 0
      }
    },
    
    issueDescription: {
      type: String,
      required: false
    },
    images: [{
      url: String,
      public_id: String
    }]
  },
  pickupAddress: {
    addressLine1: {
      type: String,
      required: true
    },
    addressLine2: String,
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    pincode: {
      type: String,
      required: true
    },
    country: {
      type: String,
      default: "India"
    }
  },
  paymentDetails: {
    method: {
      type: String,
      enum: ["COD", "PAID_TO_SELLER", "PAY_AT_SHOP", "PAID_ONLINE"],
      required: true
    },
    baseAmount: {
      type: Number,
      required: true
    },
    optionsAmount: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED"],
      default: "PENDING"
    },
    paymentProof: {
      url: String,
      public_id: String
    }
  },
  status: {
    type: String,
    enum: [
      "BOOKING_CONFIRMED",
      "PICKUP_SCHEDULED", 
      "RACQUET_COLLECTED",
      "WORK_IN_PROGRESS",
      "WORK_COMPLETED",
      "READY_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED"
    ],
    default: "BOOKING_CONFIRMED"
  },
  timeline: [{
    status: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    description: String
  }],
  scheduledPickupDate: {
    type: Date,
    required: false
  },
  estimatedDeliveryDate: {
    type: Date,
    required: false
  },
  actualDeliveryDate: {
    type: Date,
    required: false
  },
  notes: {
    customer: String,
    technician: String,
    admin: String
  }
}, {
  timestamps: true
});

// Calculate total amount before saving
serviceBookingSchema.pre('save', function(next) {
  if (this.isModified('paymentDetails.baseAmount') || this.isModified('paymentDetails.optionsAmount')) {
    this.paymentDetails.totalAmount = this.paymentDetails.baseAmount + this.paymentDetails.optionsAmount;
  }
  next();
});

// Rest of the existing middleware...
serviceBookingSchema.pre('save', async function(next) {
  if (this.isNew && (!this.bookingId || this.bookingId.includes('SB'))) {
    try {
      const count = await this.constructor.countDocuments();
      const timestamp = Date.now().toString().slice(-6);
      const counter = (count + 1).toString().padStart(3, '0');
      this.bookingId = `SB${timestamp}${counter}`;
    } catch (error) {
      console.warn('Error generating sophisticated bookingId, using default:', error.message);
    }
  }
  
  if (!this.estimatedDeliveryDate && this.service) {
    try {
      const Service = mongoose.model('Service');
      const service = await Service.findById(this.service);
      if (service) {
        const estimatedDate = new Date();
        estimatedDate.setDate(estimatedDate.getDate() + service.estimatedDays);
        this.estimatedDeliveryDate = estimatedDate;
      }
    } catch (error) {
      console.error('Error setting estimated delivery date:', error);
    }
  }
  
  next();
});

serviceBookingSchema.pre('save', function(next) {
  if (this.isModified('status') && !this.isNew) {
    this.timeline.push({
      status: this.status,
      timestamp: new Date(),
      description: getStatusDescription(this.status)
    });
  }
  next();
});

function getStatusDescription(status) {
  const descriptions = {
    "BOOKING_CONFIRMED": "Your service booking has been confirmed",
    "PICKUP_SCHEDULED": "Pickup has been scheduled",
    "RACQUET_COLLECTED": "Your racquet has been collected",
    "WORK_IN_PROGRESS": "Work is in progress on your racquet",
    "WORK_COMPLETED": "Work has been completed",
    "READY_FOR_DELIVERY": "Your racquet is ready for delivery",
    "DELIVERED": "Your racquet has been delivered",
    "CANCELLED": "Service booking has been cancelled"
  };
  return descriptions[status] || "Status updated";
}

const Service = mongoose.model("Service", serviceSchema);
const ServiceBooking = mongoose.model("ServiceBooking", serviceBookingSchema);

module.exports = { Service, ServiceBooking };